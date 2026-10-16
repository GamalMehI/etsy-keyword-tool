const fs=require('node:fs');
const path=require('node:path');
const { ROOT,MOCK }=require('./config');
const { all,one,run,saveKeyword,saveListing,transaction,setting,setSetting }=require('./db');
const { norm,now,chunks,cacheGet,cacheSet }=require('./util');
const { hasTrademark }=require('./trademark');
const { expandKeyword }=require('./google');
const { semrushRelated }=require('./semrush');
const seedFile=path.join(ROOT,'config','seeds.txt');
function seeds(){return fs.readFileSync(seedFile,'utf8').split('\n').map(norm).filter(Boolean);}
function syncSeeds() { const values=seeds();for(const kw of values) {saveKeyword(kw,'seed');run("UPDATE keywords SET source='seed' WHERE keyword=?",kw);} return values.filter(k=>!hasTrademark(k)); }
const preRank=l=>(l.num_favorers||0)+Math.sqrt(Math.max(0,l.views||0))*2;
const eligible=l=>l.listing_type==='download'&&!hasTrademark(l.title)&&((l.num_favorers||0)>=20||(l.views||0)>=500||((now()-(l.original_creation_timestamp||l.creation_timestamp||0))/86400<90&&(l.num_favorers||0)>=5));
async function expandSeeds(values) {
  if(MOCK)return;
  for(const q of values) {
    if(setting('expanded:'+q,0)>now()-7*86400)continue;
    const [g,s]=await Promise.all([expandKeyword(q,false),semrushRelated(q,20)]);
    for(const r of [...s,...g].slice(0,12))saveKeyword(norm(r.keyword),'expansion');
    setSetting('expanded:'+q,now());
  }
}
async function searchPool(client,q,{created=false}={}) {
  if(hasTrademark(q))throw Object.assign(new Error('Mot-clé bloqué par la liste de marques'),{status:400});
  let seen=0,digital=0,total=0;
  const pool=new Map();
  for(const [sort,offset] of [...[0,100,200,300,400].map(x=>['score',x]),...(created?[['created',0]]:[])]) {
    const data=await client.get('/listings/active',{keywords:q,sort_on:sort,limit:100,offset,currency:'USD'});
    total=data.count??total;
    for(const [i,l] of (data.results||[]).entries()) {
      seen++;if(l.listing_type==='download')digital++;
      if(l.listing_type!=='download'||hasTrademark(l.title))continue;
      const old=pool.get(l.listing_id);if(!old)pool.set(l.listing_id,{...l,api_rank:offset+i+1});
    }
    if(sort==='score'&&offset===0&&total===0)break;
  }
  saveKeyword(q,'interactive');
  const share=seen?digital/seen:0;
  run('UPDATE keywords SET digital_share=?,total_count=?,last_searched=?,active=? WHERE keyword=?',share,total,now(),share>=.5?1:0,q);
  return {rows:[...pool.values()].sort((a,b)=>preRank(b)-preRank(a)),total,digital_share:share};
}
function linkListing(l,q) {
  run('INSERT INTO listing_keywords VALUES(?,?,?) ON CONFLICT(listing_id,keyword) DO UPDATE SET best_rank=MIN(best_rank,excluded.best_rank)',l.listing_id,q,l.api_rank||0);
}
async function discover(client,q) {
  const pool=await searchPool(client,q,{created:true});
  if(pool.digital_share<.5)return 0;
  let count=0;
  transaction(()=>{for(const l of pool.rows.filter(eligible))if(saveListing(l,q)){linkListing(l,q);count++;}});
  return count;
}
async function batchRefresh(client,ids) {
  for(const batch of chunks(ids)) {
    const data=await client.get('/listings/batch',{listing_ids:batch,includes:'Shop,Images',currency:'USD'});
    const found=new Set();
    transaction(()=>{for(const l of data.results||[]){found.add(l.listing_id);saveListing(l,'batch');}});
    // A successful batch omitting a tracked listing means it is no longer publicly accessible.
    for(const id of batch)if(!found.has(id))run('UPDATE listings SET active=0 WHERE listing_id=?',id);
  }
}
async function classifyReviewed(client,shopId) {
  // Unknown/physical types live only in listing_types, never in listings.
  const ids=all('SELECT DISTINCT r.listing_id FROM reviews r LEFT JOIN listing_types t ON t.listing_id=r.listing_id WHERE r.shop_id=? AND t.listing_id IS NULL',shopId).map(r=>r.listing_id);
  for(const batch of chunks(ids)) {
    const data=await client.get('/listings/batch',{listing_ids:batch,includes:'Shop,Images',currency:'USD'});
    transaction(()=>{for(const l of data.results||[])saveListing(l,'review');});
    const found=new Set((data.results||[]).map(l=>l.listing_id));
    for(const id of batch)if(!found.has(id))run("INSERT OR IGNORE INTO listing_types VALUES(?,'unavailable')",id);
  }
}
async function expandShops(client,maxCalls=100) {
  const start=client.calls;
  const shops=all(`SELECT s.shop_id FROM shops s JOIN listings l ON l.shop_id=s.shop_id JOIN estimates e ON e.listing_id=l.listing_id AND e.day=(SELECT MAX(day) FROM estimates WHERE period=30) AND e.period=30 WHERE s.last_expanded<? GROUP BY s.shop_id HAVING SUM(e.sales)>100 ORDER BY SUM(e.sales) DESC`,now()-7*86400);
  for(const shop of shops){
    for(let offset=0;offset<=9900;offset+=100) {
      if(client.calls-start>=maxCalls)return;
      const r=await client.get(`/shops/${shop.shop_id}/listings/active`,{limit:100,offset,currency:'USD'});
      transaction(()=>{for(const l of r.results||[])saveListing(l,'shop');});
      if(offset+100>=r.count||(r.results||[]).length<100){run('UPDATE shops SET last_expanded=? WHERE shop_id=?',now(),shop.shop_id);break;}
    }
  }
}
module.exports={ seeds,syncSeeds,expandSeeds,searchPool,discover,batchRefresh,classifyReviewed,expandShops,preRank,eligible,linkListing,seedFile };
