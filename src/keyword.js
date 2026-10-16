const { MOCK }=require('./config');
const { all,one,run,saveListing,saveReviews,saveKeyword,transaction }=require('./db');
const { now,day,norm,median }=require('./util');
const { createClient }=require('./etsy');
const { searchPool,batchRefresh,linkListing }=require('./discovery');
const { recompute,invalidate,dataset }=require('./analytics');
const { hasTrademark }=require('./trademark');
const { scoreProducts }=require('./score');
const { semrushOverview,semrushRelated }=require('./semrush');
const { expandKeyword }=require('./google');
const inflight=new Map();
async function listingReviews(client,l) {
  const t=now(),since=t-30*86400;
  const shop=one('SELECT * FROM shops WHERE shop_id=?',l.shop_id),coverage=one('SELECT * FROM review_coverage WHERE listing_id=?',l.listing_id);
  if((shop?.last_review_ts>=t-86400&&shop.review_since<=since)||(coverage?.until_ts>=t-86400&&coverage.since_ts<=since))return;
  for(let offset=0;offset<=9900;offset+=100){
    const r=await client.get(`/listings/${l.listing_id}/reviews`,{min_created:since,limit:100,offset});
    saveReviews(r.results||[],l.shop_id);
    if(offset+100>=r.count||(r.results||[]).length<100){run('INSERT OR REPLACE INTO review_coverage VALUES(?,?,?)',l.listing_id,since,t);return;}
  }
}
async function analyze(q) {
  q=norm(q);if(!q||q.length>160||hasTrademark(q))throw Object.assign(new Error('Mot-clé vide, trop long ou bloqué par la liste de marques'),{status:400});
  const cache=one('SELECT report FROM keyword_reports WHERE keyword=? AND day=?',q,day());
  if(cache)return {...JSON.parse(cache.report),cached:true,calls:0};
  if(inflight.has(q))return inflight.get(q);
  // Serialize fresh analyses to make interactive budget and response time predictable.
  if(inflight.size)throw Object.assign(new Error('Une analyse est déjà en cours. Réessayer dans un instant.'),{status:409});
  const work=build(q).finally(()=>inflight.delete(q));inflight.set(q,work);return work;
}
async function build(q) {
  const client=createClient({maxCalls:110,deadline:Date.now()+79000});
  let pool,warning=null;
  const known=one('SELECT * FROM keywords WHERE keyword=?',q);
  const knownIds=all('SELECT listing_id FROM listing_keywords WHERE keyword=?',q).map(l=>l.listing_id);
  try{
    if(MOCK){
      let rows=all('SELECT * FROM listings WHERE title LIKE ?','%'+q+'%');
      if(!rows.length)rows=all('SELECT * FROM listings WHERE discovered_via=?','goodnotes planner');
      saveKeyword(q,'interactive');
      transaction(()=>{for(const l of rows)run('INSERT OR IGNORE INTO listing_keywords VALUES(?,?,0)',l.listing_id,q);});
      pool={total:known?.total_count||8940,digital_share:.97,rows:rows.map(l=>({...l,api_rank:0}))};
    }else if(known?.last_searched>=now()-86400&&knownIds.length>=60){
      pool={total:known.total_count,digital_share:known.digital_share,rows:all(`SELECT l.*,ls.num_favorers,ls.views FROM listings l JOIN listing_keywords lk ON lk.listing_id=l.listing_id LEFT JOIN listing_snapshots ls ON ls.listing_id=l.listing_id AND ls.day=? WHERE lk.keyword=? ORDER BY COALESCE(ls.num_favorers,0) DESC LIMIT 150`,day(),q)};
    }else pool=await searchPool(client,q);
    if(!MOCK){
      const top=pool.rows.slice(0,150);
      transaction(()=>{for(const l of top){if(l.listing_type==='download'&&saveListing(l,q))linkListing(l,q);}});
      const missing=top.filter(l=>!one('SELECT 1 FROM shops s JOIN listings l ON l.shop_id=s.shop_id WHERE l.listing_id=? AND l.last_seen>=?',l.listing_id,now()-86400)).map(l=>l.listing_id);
      if(missing.length)await batchRefresh(client,missing);
      for(const l of top.slice(0,60))await listingReviews(client,l);
    }
  }catch(e){if(!pool)throw e;warning=e.message;}
  recompute();invalidate();
  const ids=new Set(all('SELECT listing_id FROM listing_keywords WHERE keyword=?',q).map(r=>r.listing_id));
  const reviewedIds=new Set((pool?.rows||[]).slice(0,60).map(l=>l.listing_id));
  const top=dataset(30).filter(l=>ids.has(l.listing_id)&&reviewedIds.has(l.listing_id)).sort((a,b)=>b.monthly_sales-a.monthly_sales).slice(0,48);
  const [google,related,suggest]=MOCK?[null,[],all('SELECT keyword FROM keywords WHERE active=1 LIMIT 8')]:await Promise.all([semrushOverview(q),semrushRelated(q,30),expandKeyword(q,false)]);
  const subkeywords=[...new Set([...related,...suggest].map(r=>r.keyword))].filter(k=>k!==q&&!hasTrademark(k)).slice(0,30);
  const scores=scoreProducts(top,pool?.total||0,google?.volume??null);
  const leaders=top.slice(0,2).map(p=>p.listing_id);
  const complaints=leaders.flatMap(id=>all('SELECT rating,text,listing_id,created_ts FROM reviews WHERE listing_id=? AND rating<=3 AND created_ts>=? ORDER BY created_ts DESC LIMIT 5',id,now()-90*86400)).slice(0,5);
  const prices=top.map(p=>p.price_usd).filter(p=>p!=null);
  const report={keyword:q,...scores,total_count:pool?.total||0,digital_share:pool?.digital_share||0,median_price:median(prices),price_range:prices.length?[Math.min(...prices),Math.max(...prices)]:[],median_age:median(top.map(p=>p.age_days)),google,subkeywords,products:top,complaints,calls:client.calls,warning,cached:false,at:now(),review_metric:'Avis observés sur 90 jours, pas le total à vie par produit'};
  run('INSERT OR REPLACE INTO keyword_reports VALUES(?,?,?)',q,day(),JSON.stringify(report));return report;
}
module.exports={analyze,listingReviews};
