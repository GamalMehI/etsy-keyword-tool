const { MOCK,RESERVE,COLLECT_HOUR }=require('./config');
const { all,one,run,transaction,setting,setSetting,saveReviews,budget }=require('./db');
const { now,day }=require('./util');
const { createClient }=require('./etsy');
const { syncSeeds,expandSeeds,discover,batchRefresh,classifyReviewed,expandShops }=require('./discovery');
const { recompute,invalidate }=require('./analytics');
function alive(pid){if(!pid)return false;try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}}
function claimJob() {
  return transaction(()=>{
    const existing=one("SELECT * FROM jobs WHERE status='running' ORDER BY id DESC LIMIT 1");
    if(existing&&alive(existing.owner_pid))return null;
    if(existing)run("UPDATE jobs SET status='interrupted',finished=?,message='Collecte interrompue, reprise possible' WHERE id=?",now(),existing.id);
    return Number(run("INSERT INTO jobs(started,status,step,message,owner_pid) VALUES(?,'running','Préparation','',?)",now(),process.pid).lastInsertRowid);
  });
}
async function shopReviews(client,shop) {
  const t=now(),first=!shop.last_review_ts;
  // Freeze the first backfill's lower bound and resume a partial pagination next run.
  const min=first?(shop.review_since||t-90*86400):Math.max(shop.review_since||0,shop.last_review_ts-1);
  let offset=first?(shop.backfill_offset||0):0;
  if(first&&!shop.review_since)run('UPDATE shops SET review_since=? WHERE shop_id=?',min,shop.shop_id);
  for(;offset<=9900;offset+=100){
    const r=await client.get(`/shops/${shop.shop_id}/reviews`,{min_created:min,limit:100,offset});
    saveReviews(r.results||[],shop.shop_id);
    if(first)run('UPDATE shops SET backfill_offset=? WHERE shop_id=?',offset+100,shop.shop_id);
    if(offset+100>=r.count||(r.results||[]).length<100){
      run('UPDATE shops SET last_review_ts=?,backfill_offset=0 WHERE shop_id=?',t,shop.shop_id);
      await classifyReviewed(client,shop.shop_id);return;
    }
  }
  // Stay conservative if an API pagination ceiling prevents full coverage.
}
async function collect({bootstrap=false}={}) {
  const id=claimJob();if(!id)return {already_running:true};
  const client=createClient({background:true});
  const progress=(step,message='')=>run('UPDATE jobs SET step=?,message=?,calls=? WHERE id=?',step,message,client.calls,id);
  let status='success',message='Collecte terminée';
  try {
    if(MOCK){require('./mock').seedMock();progress('Données d’exemple');}
    else {
      const seedWords=syncSeeds();
      if(!setting('taxonomy')){progress('Taxonomie');setSetting('taxonomy',await client.get('/buyer-taxonomy/nodes'));}
      if(!bootstrap){
        progress('A · Rafraîchir les produits');
        await batchRefresh(client,all('SELECT listing_id FROM listings WHERE active=1 ORDER BY last_seen').map(l=>l.listing_id));
        progress('B · Nouveaux avis');
        for(const s of all(`SELECT s.* FROM shops s LEFT JOIN shop_snapshots ss ON ss.shop_id=s.shop_id AND ss.day=? WHERE s.last_review_ts>0 AND s.last_review_ts<? ORDER BY ss.transaction_sold_count DESC`,day(),now()-3600)){
          if(client.calls>=2200)break;progress('B · Nouveaux avis',s.shop_name);await shopReviews(client,s);
        }
      }
      progress('C · Expansion des mots-clés');await expandSeeds(seedWords);
      const startDiscovery=client.calls;
      // A bootstrap seeks a useful 3,000-product pool, not an unbounded search crawl.
      const keywords=all(`SELECT * FROM keywords WHERE active=1 ORDER BY ${bootstrap?"CASE WHEN source='seed' THEN 0 ELSE 1 END,":''} last_searched,keyword`);
      for(const k of keywords){
        if(client.calls-startDiscovery>=850)break;
        if(bootstrap&&one('SELECT COUNT(*) AS n FROM listings WHERE active=1').n>=3500)break;
        if(k.last_searched>now()-86400)continue;
        progress('C · Découverte',k.keyword);await discover(client,k.keyword);
      }
      progress('C · Détails des nouveaux produits');
      const ids=all(`SELECT l.listing_id FROM listings l LEFT JOIN listing_snapshots ls ON ls.listing_id=l.listing_id AND ls.day=? WHERE l.active=1 AND (l.image_url='' OR l.shop_id NOT IN(SELECT shop_id FROM shops)) ORDER BY ls.num_favorers DESC LIMIT ?`,day(),bootstrap?3000:10000).map(l=>l.listing_id);
      await batchRefresh(client,ids);
      if(!bootstrap){progress('C · Expansion des boutiques');await expandShops(client,Math.max(0,1000-(client.calls-startDiscovery)));}
      progress('D · Historique des nouvelles boutiques');
      // Classifications can have been interrupted after reviews finished; retry separately.
      for(const s of all(`SELECT s.* FROM shops s LEFT JOIN shop_snapshots ss ON ss.shop_id=s.shop_id AND ss.day=? ORDER BY CASE WHEN s.last_review_ts=0 THEN 0 ELSE 1 END,ss.transaction_sold_count DESC`,day())) {
        if(s.last_review_ts===0){progress('D · Historique 90 jours',s.shop_name);await shopReviews(client,s);}
        else await classifyReviewed(client,s.shop_id);
      }
    }
  } catch(e) {
    status=e.code==='BUDGET'?'budget':'error';message=e.code==='BUDGET'?'Réserve préservée. Les données partielles seront reprises à la prochaine collecte.':e.message;
  } finally {
    progress('Calcul des estimations');
    try{recompute();invalidate();}catch(e){status='error';message=e.message;}
    run('UPDATE jobs SET finished=?,status=?,step=?,message=?,calls=? WHERE id=?',now(),status,'Terminé',message,client.calls,id);
  }
  return {id,status,message,calls:client.calls,...budget()};
}
function schedule() {
  const tick=()=>{
    const hour=setting('collect_hour',COLLECT_HOUR);
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
    const date=`${parts.year}-${parts.month}-${parts.day}`;
    if(Number(parts.hour)>=hour && setting('scheduled_day')!==date){setSetting('scheduled_day',date);collect().catch(()=>{});}
  };
  const timer=setInterval(tick,30000);timer.unref();return timer;
}
module.exports={ collect,schedule,shopReviews,claimJob };
