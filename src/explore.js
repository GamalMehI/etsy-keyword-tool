// Pure matching/discovery functions live here; database/network adapters are lazy below.
const { hasTrademark } = require('./trademark');
const { scoreProducts } = require('./score');
const { median, now, cacheGet } = require('./util');
// Editable: format-only phrases do not identify a market. A qualified phrase survives.
const GENERIC_PHRASES = ['digital download','instant download','instant access','printable','printables','commercial use','personal use','editable template','pdf pattern','canva template','digital file','pdf file','png file','high resolution','ready to print','download now','downloadable file','digital product','instant digital download','digital printable','printable download','printable pdf','pdf download','digital pdf','digital template','template bundle','pdf printable','digital art','digital print','weekly monthly','daily weekly','daily weekly monthly','monthly weekly'];
const STOP = new Set('a an the and or for with of in on to by from at as this that your you our my it is are get all not no de la et'.split(' '));
function unescapeHtml(value) {
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',ndash:'–',mdash:'—',hellip:'…'};
  return String(value||'').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(full,key)=>{
    if(key[0]!=='#')return named[key.toLowerCase()]??full;
    const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));
    return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):full;
  });
}
function singular(word) {
  if(['goodnotes','christmas','canvas','business','series'].includes(word))return word;
  if(word.length>4&&word.endsWith('ies'))return word.slice(0,-3)+'y';
  if(/(?:ches|shes|xes|zes)$/.test(word))return word.slice(0,-2);
  if(word.length>3&&word.endsWith('s')&&!/(ss|us|is|as)$/.test(word))return word.slice(0,-1);
  return word;
}
const words = text => (unescapeHtml(text).toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu)||[]).map(singular);
const phraseKey = text => words(text).join(' ');
const canonicalKey = text => words(text).sort().join(' ');
function containsWords(haystack,needle) {
  if(!needle.length)return false;
  for(let i=0;i<=haystack.length-needle.length;i++)if(needle.every((w,j)=>w===haystack[i+j]))return true;
  return false;
}
function phraseMatcher(niche) {
  const escaped=w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const variants=words(niche).map(w=>{
    const forms=[w];
    if(!['goodnotes','christmas','canvas','business','series'].includes(w)){
      forms.push(w+'s');if(w.endsWith('y'))forms.push(w.slice(0,-1)+'ies');if(/(?:ch|sh|x|z)$/.test(w))forms.push(w+'es');
    }
    return '(?:'+forms.map(escaped).join('|')+')';
  });
  return new RegExp('(?<![\\p{L}\\p{N}])'+variants.join('[^\\p{L}\\p{N}\\n]+')+'(?![\\p{L}\\p{N}])','iu');
}
const searchableText = p => unescapeHtml([p.title,...(p.tags||[])].join('\n')).normalize('NFKC');
function matchesPhrase(product,niche,linkedIds=new Set()) {
  if(product.active===0||product.listing_type!=='download'||hasTrademark(unescapeHtml(product.title)))return false;
  return linkedIds.has(product.listing_id)||phraseMatcher(niche).test(searchableText(product));
}

const GENERIC_KEYS=new Set(GENERIC_PHRASES.map(phraseKey));
function isCandidate(phrase,parent='') {
  const ws=words(phrase),key=ws.join(' ');
  if(ws.length<2||ws.length>12||key.length>160||hasTrademark(key)||STOP.has(ws[0])||STOP.has(ws.at(-1)))return false;
  if(canonicalKey(phrase)===canonicalKey(parent))return false;
  return !GENERIC_KEYS.has(key)&&!['junk','digital'].includes(ws.at(-1));
}
function extractPhrases(product,parent='',validity=new Map()) {
  const found=new Set();
  // Punctuation separates title clauses; tags remain separate phrases.
  const chunks=[...unescapeHtml(product.title).split(/[,|:;·()\n—–]/),...(product.tags||[])];
  for(const text of chunks){const ws=words(text);for(let n=2;n<=4;n++)for(let i=0;i+n<=ws.length;i++){
    const p=ws.slice(i,i+n).join(' ');if(!validity.has(p))validity.set(p,isCandidate(p,parent));if(validity.get(p))found.add(p);
  }}
  return [...found];
}
const sum=(rows,key)=>rows.reduce((s,p)=>s+(p[key]||0),0);
function top3Share(products) {
  const shops=new Map();for(const p of products)if(p.monthly_revenue!=null)shops.set(p.shop_id,(shops.get(p.shop_id)||0)+p.monthly_revenue);
  const amounts=[...shops.values()].sort((a,b)=>b-a),total=amounts.reduce((a,b)=>a+b,0);
  return total>0?amounts.slice(0,3).reduce((a,b)=>a+b,0)/total:null;
}
function passesThreshold(products) { return products.length>=8&&new Set(products.map(p=>p.shop_id)).size>=5; }
function overlap(a,b) {
  const smaller=a.size<b.size?a:b,larger=smaller===a?b:a;let n=0;for(const id of smaller)if(larger.has(id))n++;
  // Jaccard overlap: do not swallow a real narrow child into a broad parent phrase.
  return n/(a.size+b.size-n)||0;
}
function mergeCandidates(candidates,{mergeOverlap=true}={}) {
  const canonical=new Map();
  for(const c of candidates){const key=canonicalKey(c.niche),old=canonical.get(key);
    if(!old){canonical.set(key,{...c,ids:new Set(c.ids),aliases:c.aliases?[...c.aliases]:[c.niche]});continue;}
    old.aliases.push(c.niche);for(const id of c.ids)old.ids.add(id);
    if(c.monthly_revenue>old.monthly_revenue){old.niche=c.niche;old.monthly_revenue=c.monthly_revenue;}
  }
  if(!mergeOverlap)return [...canonical.values()];
  const kept=[];
  for(const c of [...canonical.values()].sort((a,b)=>b.monthly_revenue-a.monthly_revenue||a.niche.localeCompare(b.niche))){
    const duplicate=kept.find(k=>Math.min(k.ids.size,c.ids.size)/Math.max(k.ids.size,c.ids.size)>=.8&&overlap(k.ids,c.ids)>=.8);
    if(duplicate)duplicate.aliases.push(...c.aliases);else kept.push(c);
  }
  return kept;
}
function whyWins(p,medianPrice,period=30) {
  const parts=[];
  if(p.shop_age_days!=null)parts.push(`Boutique de ${p.shop_age_days<60?Math.round(p.shop_age_days)+' j':Math.round(p.shop_age_days/30)+' mois'}`);
  parts.push(`${p.reviews_in_period||0} avis en ${period} j`);
  if(p.price_usd!=null&&medianPrice>0&&p.price_usd/medianPrice>=1.5)parts.push(`prix ${(p.price_usd/medianPrice).toLocaleString('fr-FR',{maximumFractionDigits:1})}× la médiane`);
  else if(p.monthly_sales>=10)parts.push(`${Math.round(p.monthly_sales).toLocaleString('fr-FR')} ventes/mois est.`);
  return parts.join(', ');
}
const LEVELS={Basse:1,Moyenne:2,Haute:3};
function filterProducts(rows,filters={}) {
  return rows.filter(p=>(!filters.min||(p.price_usd!=null&&p.price_usd>=Number(filters.min)))&&(!filters.max||(p.price_usd!=null&&p.price_usd<=Number(filters.max)))&&p.age_days<=Number(filters.age||Infinity)&&(LEVELS[p.confidence]||1)>=Number(filters.confidence||1));
}
function rankProducts(rows,sort='revenue') {
  const field={revenue:'monthly_revenue',monthly_revenue:'monthly_revenue',sales:'monthly_sales',monthly_sales:'monthly_sales',velocity:'velocity',trend:'trend',newest:'monthly_sales'}[sort]||'monthly_revenue';
  return rows.filter(p=>sort!=='newest'||p.age_days<180).sort((a,b)=>{
    const av=a[field],bv=b[field];return av==null?(bv==null?a.listing_id-b.listing_id:1):bv==null?-1:bv-av||a.listing_id-b.listing_id;
  });
}
function metrics(rows,period=30,parentRevenue=null,totalCount=0) {
  const priced=rows.filter(p=>p.monthly_revenue!=null),monthly_revenue=priced.length?sum(priced,'monthly_revenue'):null;
  const prior=priced.length&&priced.every(p=>p.previous_sales!=null)?priced.reduce((s,p)=>s+p.previous_sales*p.price_usd*30/period,0):null;
  const success=rows.filter(p=>p.monthly_sales>=10);
  return {...scoreProducts(rows,totalCount),listings:rows.length,shops:new Set(rows.map(p=>p.shop_id)).size,priced:priced.length,
    monthly_revenue,monthly_sales:sum(rows,'monthly_sales'),selling_10:success.length,young_selling:success.filter(p=>p.age_days<365).length,
    young_shops_selling:new Set(success.filter(p=>p.shop_age_days!=null&&p.shop_age_days<365).map(p=>p.shop_id)).size,
    top3_share:top3Share(rows),median_price:priced.length?median(priced.map(p=>p.price_usd)):null,trend:prior>0?(monthly_revenue/prior-1)*100:null,
    parent_revenue_share:parentRevenue>0&&monthly_revenue!=null?monthly_revenue/parentRevenue:null,competition_scope:totalCount?'API : tous formats':'échantillon suivi uniquement'};
}
function discoverSubniches(products,parent,{keywords=[],suggestions=[],links=new Map(),period=30,ancestors=[]}={}) {
  const byId=new Map(products.map(p=>[p.listing_id,p])),candidates=new Map(),validity=new Map(),ancestorKeys=new Set(ancestors.map(canonicalKey));
  const add=(niche,id)=>{
    if(!validity.has(niche))validity.set(niche,isCandidate(niche,parent)&&!ancestorKeys.has(canonicalKey(niche)));if(!validity.get(niche)||ancestorKeys.has(canonicalKey(niche)))return;
    const key=phraseKey(niche);if(!candidates.has(key))candidates.set(key,{niche:key,ids:new Set()});candidates.get(key).ids.add(id);
  };
  // Inverted phrase index: scan the parent's products once, rather than every candidate × every listing.
  for(const p of products)for(const phrase of extractPhrases(p,parent,validity))add(phrase,p.listing_id);
  for(const c of candidates.values())for(const id of links.get(c.niche)||[])if(byId.has(id))c.ids.add(id);
  for(const k of [...keywords.filter(k=>containsWords(words(typeof k==='string'?k:k.keyword),words(parent))),...suggestions]){
    const phrase=typeof k==='string'?k:k.keyword;
    if(!isCandidate(phrase,parent))continue;
    // Existing containing keywords and cached helper suggestions can extend past four words.
    const ids=links.get(phrase)||new Set(),matcher=phraseMatcher(phrase);
    for(const p of products)if(ids.has(p.listing_id)||matcher.test(searchableText(p)))add(phrase,p.listing_id);
  }
  const raw=[...candidates.values()].map(c=>({...c,monthly_revenue:[...c.ids].reduce((s,id)=>s+(byId.get(id)?.monthly_revenue||0),0)}));
  const merged=mergeCandidates(raw,{mergeOverlap:false});
  for(const c of merged)c.monthly_revenue=[...c.ids].reduce((s,id)=>s+(byId.get(id)?.monthly_revenue||0),0);
  const qualified=merged.filter(c=>passesThreshold([...c.ids].map(id=>byId.get(id)))),eligible=mergeCandidates(qualified);
  const counts=new Map();for(const k of keywords)if(typeof k!=='string')counts.set(phraseKey(k.keyword),Math.max(counts.get(phraseKey(k.keyword))||0,k.total_count||0));
  const parentRevenue=products.some(p=>p.monthly_revenue!=null)?sum(products,'monthly_revenue'):null;
  const rows=eligible.map(c=>{
    const ps=[...c.ids].map(id=>byId.get(id)),m=metrics(ps,period,parentRevenue,counts.get(phraseKey(c.niche))||0);
    return {niche:c.niche,aliases:c.aliases,listing_ids:[...c.ids],...m,products:rankProducts(ps).slice(0,3)};
  }).sort((a,b)=>b.opportunity-a.opportunity||(b.monthly_revenue||0)-(a.monthly_revenue||0)||a.niche.localeCompare(b.niche));
  return {subniches:rows.slice(0,30),hidden_subniches:merged.length-qualified.length,more_subniches:Math.max(0,rows.length-30),candidates:merged.length};
}
// Read-only DB adapter. GET never calls a remote helper or Etsy.
const indexes=new WeakMap();
function localIndex(period) {
  const {dataset}=require('./analytics'),{all}=require('./db'),data=dataset(period);
  if(indexes.has(data))return indexes.get(data);
  const products=data.filter(p=>p.active===1&&p.listing_type==='download'&&!hasTrademark(unescapeHtml(p.title)));
  const links=new Map();for(const row of all('SELECT listing_id,keyword FROM listing_keywords')){if(!links.has(row.keyword))links.set(row.keyword,new Set());links.get(row.keyword).add(row.listing_id);}
  const keywords=all('SELECT keyword,last_searched,total_count FROM keywords WHERE active=1');
  const index={data,products,links,keywords,texts:new Map(products.map(p=>[p.listing_id,searchableText(p)])),results:new Map()};indexes.set(data,index);return index;
}
function warmExplore(){for(const period of [7,30,90])localIndex(period);}
function coverage(rows,keyword,budgetValue,tracked=rows.length) {
  const {RESERVE,MOCK}=require('./config');
  const last=rows.length?Math.min(...rows.map(p=>p.last_seen||0)):null;
  return {tracked,updated_at:last,last_searched:keyword?.last_searched||null,
    needs_fetch:tracked<60||!(keyword?.last_searched>=now()-86400),budget:{remaining:budgetValue.remaining,reserve:RESERVE,required:110},
    can_fetch:MOCK||budgetValue.remaining>=RESERVE+110};
}
function explore(params) {
  const {all,budget}=require('./db');
  const period=[7,30,90].includes(Number(params.get('period')))?Number(params.get('period')):30;
  const path=[params.get('niche'),...params.getAll('sub')].map(p=>String(p||'').toLowerCase().replace(/\s+/g,' ').trim());
  if(path.length>12||path.some(p=>!words(p).length||p.length>160||hasTrademark(p)))throw Object.assign(new Error('Saisir une niche valide, sans marque bloquée (160 caractères maximum).'),{status:400});
  const niche=path.at(-1),language=params.get('language')||'en',index=localIndex(period),key=JSON.stringify([path,language]);
  let result=index.results.get(key);
  if(!result){
    let rows=index.products.filter(p=>language==='all'||(p.language||'').startsWith(language));
    for(let i=0;i<path.length;i++){
      const phrase=path[i],matcher=phraseMatcher(phrase),ids=index.links.get(phrase);
      const parentKey=JSON.stringify([path.slice(0,i),language]);
      if(i&&!index.results.has(parentKey)){const parentParams=new URLSearchParams({niche:path[0],period,language});path.slice(1,i).forEach(p=>parentParams.append('sub',p));explore(parentParams);}
      const merged=index.results.get(parentKey)?.subniches.find(s=>s.niche===phrase);
      const mergedIds=merged?new Set(merged.listing_ids):null;
      rows=rows.filter(p=>mergedIds?mergedIds.has(p.listing_id):ids?.has(p.listing_id)||matcher.test(index.texts.get(p.listing_id)));
    }
    const known=index.keywords.find(k=>k.keyword===niche),summary=metrics(rows,period,null,known?.total_count||0);
    const report=require('./db').one('SELECT report FROM keyword_reports WHERE keyword=? ORDER BY day DESC LIMIT 1',niche);
    const suggestions=[...(cacheGet('gs:'+niche)||[]),...(cacheGet('gs:etsy '+niche)||[]),...(cacheGet('srr:'+niche+':30')||[]),...(report?JSON.parse(report.report).subkeywords||[]:[])];
    const discovery=discoverSubniches(rows,niche,{keywords:index.keywords,suggestions,links:index.links,period,ancestors:path});
    const medianPrice=summary.median_price;
    const subniches=discovery.subniches.map(s=>{
      const leaders=s.products.slice(0,2).map(p=>p.listing_id);
      const complaints=leaders.flatMap(id=>all('SELECT rating,text,listing_id,created_ts FROM reviews WHERE listing_id=? AND rating BETWEEN 1 AND 3 ORDER BY created_ts DESC LIMIT 3',id)).sort((a,b)=>b.created_ts-a.created_ts).slice(0,3).map(c=>({...c,text:unescapeHtml(c.text)}));
      return {...s,complaints};
    });
    result={niche,path,period,summary,rows:rows.map(p=>({...p,why_wins:whyWins(p,medianPrice,period)})),subniches,hidden_subniches:discovery.hidden_subniches,more_subniches:discovery.more_subniches};
    if(index.results.size>=30)index.results.delete(index.results.keys().next().value);index.results.set(key,result);
  }
  const b=budget(),rows=rankProducts(filterProducts(result.rows,Object.fromEntries(params)),params.get('sort')||'revenue');
  const offset=Math.max(0,Number(params.get('offset'))||0),limit=Math.min(100,Math.max(1,Number(params.get('limit'))||50));
  return {...result,rows:undefined,coverage:coverage(result.rows,index.keywords.find(k=>k.keyword===niche),b),products:rows.slice(offset,offset+limit),total:rows.length,offset,limit,
    subniches:result.subniches.map(({listing_ids,...s})=>({...s,coverage:coverage(s.products,index.keywords.find(k=>k.keyword===s.niche),b,s.listings),tracked:s.listings}))};
}
async function fetchNiche(niche) {
  if(!words(niche).length)throw Object.assign(new Error('Saisir une niche valide.'),{status:400});
  return require('./keyword').analyze(niche,{preserveReserve:true});
}
module.exports={warmExplore,GENERIC_PHRASES,phraseMatcher,words,phraseKey,canonicalKey,containsWords,matchesPhrase,isCandidate,extractPhrases,top3Share,passesThreshold,overlap,mergeCandidates,whyWins,filterProducts,rankProducts,metrics,discoverSubniches,unescapeHtml,explore,fetchNiche};
