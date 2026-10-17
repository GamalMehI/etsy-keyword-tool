const { db,all,one,run,transaction }=require('./db');
const { day,now,median }=require('./util');
const { DAY,globalK,calibrateK,allocation,estimate,badges,delta }=require('./estimate');
const { scoreProducts }=require('./score');
const group=(rows,key)=>{const m=new Map();for(const row of rows){if(!m.has(row[key]))m.set(row[key],[]);m.get(row[key]).push(row);}return m;};
function recompute() {
  const date=day(),t=now(),today=Date.parse(date)/1000;
  const shops=all('SELECT * FROM shops'), history=group(all('SELECT * FROM shop_snapshots ORDER BY day'),'shop_id');
  const listings=group(all('SELECT * FROM listings WHERE active=1'),'shop_id');
  const snapshots=group(all('SELECT * FROM listing_snapshots ORDER BY day'),'listing_id');
  const reviews=group(all('SELECT shop_id,listing_id,created_ts FROM reviews WHERE created_ts>=?',t-180*DAY),'shop_id');
  const knownTypes=new Map(all('SELECT * FROM listing_types').map(r=>[r.listing_id,r.listing_type]));
  const cover=new Map(all('SELECT * FROM review_coverage').map(r=>[r.listing_id,r]));
  const latest=shops.map(s=>(history.get(s.shop_id)||[]).at(-1)).filter(Boolean), fallback=globalK(latest);
  const insert=db.prepare('INSERT OR REPLACE INTO estimates VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const before=(rows,ts)=>rows.findLast(r=>Date.parse(r.day)/1000<=ts);
  transaction(()=>{
    for(const shop of shops) {
      const hist=history.get(shop.shop_id)||[],last=hist.at(-1),products=listings.get(shop.shop_id)||[],rs=reviews.get(shop.shop_id)||[];
      if(!last) continue;
      const old30=before(hist,today-30*DAY),historyDays=hist.length?(today-Date.parse(hist[0].day)/1000)/DAY:0;
      const k=calibrateK({sales:last.transaction_sold_count,reviews:last.review_count,recentSales:old30&&last.transaction_sold_count>=old30.transaction_sold_count?delta(last,old30,'transaction_sold_count'):null,recentReviews:delta(last,old30,'review_count'),historyDays:old30?.day===day((today-30*DAY)*1000)?historyDays:0,fallback});
      const r90=rs.filter(r=>r.created_ts>=t-90*DAY),byListing=group(rs,'listing_id');
      const reviewTotal=products.reduce((s,l)=>s+(byListing.get(l.listing_id)||[]).filter(r=>r.created_ts>=t-90*DAY).length,0);
      const factor=r90.length?reviewTotal/r90.length:(last.digital_listing_count===last.listing_active_count?1:0);
      const classified=rs.every(r=>knownTypes.has(r.listing_id)&&!['unknown','unavailable'].includes(knownTypes.get(r.listing_id)));
      const reviewFresh=shop.last_review_ts>=t-DAY;
      for(const period of [7,30,90]) {
        const target=today-period*DAY,old=before(hist,target),covered=old?period:Math.max(0,Math.min(period,historyDays));
        const hasDelta=!!old && old.day===day(target*1000) && last.day===date && last.transaction_sold_count!=null && old.transaction_sold_count!=null && last.transaction_sold_count>=old.transaction_sold_count;
        const attrs=products.map(l=>{const ss=snapshots.get(l.listing_id)||[],cur=ss.at(-1),prev=before(ss,target);return {listing_id:l.listing_id,reviews90:(byListing.get(l.listing_id)||[]).filter(r=>r.created_ts>=t-90*DAY).length,favoriteGain:prev?delta(cur,prev,'num_favorers'):0,viewGain:prev?delta(cur,prev,'views'):0};});
        const allocations=hasDelta?allocation({shopSales:delta(last,old,'transaction_sold_count'),digitalFactor:factor,listings:attrs,singleDigital:last.digital_listing_count===1&&last.listing_active_count===1}):{};
        for(const l of products) {
          const lr=byListing.get(l.listing_id)||[],count=lr.filter(r=>r.created_ts>=t-period*DAY).length;
          const previous=shop.review_since && shop.review_since<=t-2*period*DAY ? lr.filter(r=>r.created_ts>=t-2*period*DAY&&r.created_ts<t-period*DAY).length : null;
          const lc=cover.get(l.listing_id),complete=(reviewFresh&&shop.review_since<=t-period*DAY)||(lc&&lc.since_ts<=t-period*DAY&&lc.until_ts>=t-DAY);
          const e=estimate({reviews:count,k,price:l.price_usd,period,deltaSales:allocations[l.listing_id]??null,deltaDays:hasDelta?period:covered,digitalListings:last.digital_listing_count??Infinity,reviewShare90:reviewTotal?(byListing.get(l.listing_id)||[]).filter(r=>r.created_ts>=t-90*DAY).length/reviewTotal:0,previousReviews:previous,complete:!!complete&&classified});
          insert.run(l.listing_id,date,period,e.sales,e.revenue,e.method,e.confidence,e.previous_sales,e.trend,k,e.coverage_days);
        }
      }
    }
  });
}
function productRows(period=30) {
  const estimateDay=one('SELECT MAX(day) AS day FROM estimates WHERE period=?',period)?.day||day();
  return all(`SELECT l.*,s.shop_name,s.created_ts AS shop_created,ss.transaction_sold_count AS shop_sales,ss.digital_listing_count,ss.listing_active_count,ss.review_average,ls.num_favorers AS favorites,ls.views,e.sales,e.revenue,e.method,e.confidence,e.trend,e.k,e.coverage_days,e.previous_sales,
    (SELECT COUNT(*) FROM reviews r WHERE r.listing_id=l.listing_id AND r.created_ts>=?) AS review_count, (SELECT COUNT(*) FROM reviews r WHERE r.listing_id=l.listing_id AND r.created_ts>=?) AS reviews_in_period, (SELECT COUNT(*) FROM reviews r WHERE r.listing_id=l.listing_id) AS observed_reviews
    FROM listings l JOIN estimates e ON e.listing_id=l.listing_id AND e.day=? AND e.period=?
    LEFT JOIN shops s ON s.shop_id=l.shop_id LEFT JOIN shop_snapshots ss ON ss.shop_id=l.shop_id AND ss.day=(SELECT MAX(day) FROM shop_snapshots WHERE shop_id=l.shop_id)
    LEFT JOIN listing_snapshots ls ON ls.listing_id=l.listing_id AND ls.day=(SELECT MAX(day) FROM listing_snapshots WHERE listing_id=l.listing_id) WHERE l.active=1`,now()-90*DAY,now()-period*DAY,estimateDay,period).map(p=>{
    const age_days=Math.max(1,(now()-p.created_ts)/DAY),monthly_sales=p.sales*30/period;
    return {...p,tags:JSON.parse(p.tags),age_days,shop_age_days:p.shop_created?Math.max(0,(now()-p.shop_created)/DAY):null,monthly_sales,monthly_revenue:p.revenue==null?null:p.revenue*30/period,estimated_lifetime_sales:p.observed_reviews*p.k,velocity:p.observed_reviews*p.k/age_days,badges:badges(age_days,monthly_sales)};
  });
}
let cached=null;
function invalidate() { cached=null; }
function dataset(period=30) {
  if(!cached||cached.date!==day())cached={date:day(),version:one('PRAGMA data_version').data_version,checked:Date.now(),periods:new Map()};
  if(Date.now()-cached.checked>30000){const version=one('PRAGMA data_version').data_version;if(version!==cached.version)cached={...cached,version,periods:new Map()};cached.checked=Date.now();}
  if(!cached.periods.has(period))cached.periods.set(period,productRows(period));
  return cached.periods.get(period);
}
function products(params) {
  const period=[7,30,90].includes(Number(params.get('period')))?Number(params.get('period')):30;
  const ids=params.get('niche')?new Set(all('SELECT listing_id FROM listing_keywords WHERE keyword=?',params.get('niche')).map(r=>r.listing_id)):null;
  const q=(params.get('q')||'').toLowerCase(),language=params.get('language')||'en';
  const levels={Basse:1,Moyenne:2,Haute:3};
  let rows=dataset(period).filter(p=>(!ids||ids.has(p.listing_id))&&(!q||[p.title,p.shop_name,...p.tags].join(' ').toLowerCase().includes(q))&&(language==='all'||p.language.startsWith(language))&&(!params.get('min')||(p.price_usd!=null&&p.price_usd>=Number(params.get('min'))))&&(!params.get('max')||(p.price_usd!=null&&p.price_usd<=Number(params.get('max'))))&&p.age_days<=Number(params.get('age')||1e9)&&levels[p.confidence]>=Number(params.get('confidence')||1));
  const sort=['monthly_revenue','monthly_sales','price_usd','trend','favorites','age_days','velocity','confidence','title'].includes(params.get('sort'))?params.get('sort'):'monthly_revenue';
  const dir=params.get('dir')==='asc'?1:-1;
  rows.sort((a,b)=>dir*(sort==='title'?a.title.localeCompare(b.title):sort==='confidence'?levels[a.confidence]-levels[b.confidence]:(a[sort]??-Infinity)-(b[sort]??-Infinity))||a.listing_id-b.listing_id);
  const total=rows.length,offset=Math.max(0,Number(params.get('offset'))||0),limit=Math.min(200,Math.max(1,Number(params.get('limit'))||50));
  return {period,total,priced:rows.filter(p=>p.price_usd!=null).length,revenue:rows.reduce((s,p)=>s+(p.revenue||0),0),viral:rows.filter(p=>p.badges.includes('Viral')).length,rows:rows.slice(offset,offset+limit),offset,limit};
}
function detail(id,period) {
  const p=dataset(period).find(p=>p.listing_id===id);if(!p)return null;
  const rs=all('SELECT created_ts FROM reviews WHERE listing_id=? AND created_ts>=?',id,now()-period*DAY),ss=all('SELECT * FROM listing_snapshots WHERE listing_id=? AND day>=? ORDER BY day',id,day(Date.now()-period*86400000));
  const counts=new Map();for(const r of rs){const d=day(r.created_ts*1000);counts.set(d,(counts.get(d)||0)+1);}
  return {...p,chart:Array.from({length:period},(_,i)=>{const d=day(Date.now()-(period-1-i)*86400000);return {day:d,sales:(counts.get(d)||0)*p.k,favorites:ss.find(s=>s.day===d)?.num_favorers??null};})};
}
function niches(period=30) {
  const ps=new Map(dataset(period).map(p=>[p.listing_id,p])),links=group(all('SELECT * FROM listing_keywords'),'keyword');
  const reports=new Map(all('SELECT keyword,report FROM keyword_reports ORDER BY day').map(r=>[r.keyword,JSON.parse(r.report)]));
  const weekly=group(all(`SELECT lk.keyword, CAST((?-r.created_ts)/604800 AS INTEGER) AS week, SUM(e.k*COALESCE(l.price_usd,0)) AS revenue FROM reviews r JOIN listings l ON l.listing_id=r.listing_id JOIN listing_keywords lk ON lk.listing_id=l.listing_id JOIN estimates e ON e.listing_id=l.listing_id AND e.day=(SELECT MAX(day) FROM estimates WHERE period=30) AND e.period=30 WHERE r.created_ts>=? GROUP BY lk.keyword,week`,now(),now()-12*7*DAY),'keyword');
  return all('SELECT * FROM keywords WHERE active=1').map(k=>{
    const rows=(links.get(k.keyword)||[]).map(r=>ps.get(r.listing_id)).filter(Boolean);if(!rows.length)return null;
    const r=reports.get(k.keyword),scores=scoreProducts(rows,k.total_count,r?.google?.volume??null),revenue=rows.reduce((s,p)=>s+(p.revenue||0),0),prev=rows.every(p=>p.previous_sales!=null)?rows.reduce((s,p)=>s+p.previous_sales*(p.price_usd||0),0):null;
    const young=rows.filter(p=>p.age_days<90),new_success=young.length?young.filter(p=>p.monthly_sales>=5).length/young.length:0;
    return {...k,...scores,listings:rows.length,shops:new Set(rows.map(p=>p.shop_id)).size,priced:rows.filter(p=>p.price_usd!=null).length,revenue,monthly_revenue:revenue*30/period,trend:prev>0?(revenue/prev-1)*100:null,median_price:median(rows.map(p=>p.price_usd)),new_success,google:r?.google??null,sparkline:Array.from({length:12},(_,i)=>(weekly.get(k.keyword)||[]).find(w=>w.week===11-i)?.revenue??0),confidence:rows.every(p=>p.confidence==='Haute')?'Haute':rows.some(p=>p.confidence!=='Basse')?'Moyenne':'Basse'};
  }).filter(Boolean).sort((a,b)=>b.opportunity-a.opportunity||b.revenue-a.revenue);
}
module.exports={ recompute,productRows,products,dataset,detail,niches,invalidate };
