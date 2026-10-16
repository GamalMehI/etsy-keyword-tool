const fs=require('node:fs');
const { MOCK,ETSY_KEY,ETSY_SECRET,SEMRUSH_KEY,RESERVE,COLLECT_HOUR }=require('./config');
const { all,one,run,budget,setting,setSetting }=require('./db');
const { now,norm }=require('./util');
const { products,detail,niches }=require('./analytics');
const { collect }=require('./collector');
const { analyze }=require('./keyword');
const { seeds,seedFile,syncSeeds }=require('./discovery');
const { hasTrademark }=require('./trademark');
function stats() {
 const hist=one('SELECT COUNT(DISTINCT day) AS days,MIN(day) AS first,MAX(day) AS last FROM listing_snapshots');
 const days=hist.first?Math.floor((Date.now()-Date.parse(hist.first))/86400000):0;
 return {mock:MOCK,etsy:!!(ETSY_KEY&&ETSY_SECRET),semrush:!!SEMRUSH_KEY,budget:{...budget(),reserve:RESERVE},listings:one('SELECT COUNT(*) AS n FROM listings WHERE active=1').n,shops:one('SELECT COUNT(*) AS n FROM shops').n,reviews:one('SELECT COUNT(*) AS n FROM reviews').n,history_days:days,snapshot_days:hist.days,last_snapshot:hist.last,job:one('SELECT * FROM jobs ORDER BY id DESC LIMIT 1')||null,hour:setting('collect_hour',COLLECT_HOUR),timezone:'Africa/Casablanca',niches:all('SELECT DISTINCT lk.keyword FROM listing_keywords lk JOIN listings l ON l.listing_id=lk.listing_id WHERE l.active=1 ORDER BY lk.keyword').map(k=>k.keyword),keywords:all('SELECT keyword FROM keywords WHERE active=1 ORDER BY keyword').map(k=>k.keyword)};
}
async function body(req) {
 let value='';for await(const chunk of req){value+=chunk;if(value.length>32000)throw Object.assign(new Error('Requête trop longue'),{status:413});}
 try{return JSON.parse(value||'{}');}catch{throw Object.assign(new Error('JSON invalide'),{status:400});}
}
async function route(req,url) {
 const p=url.pathname;
 if(req.method==='GET'){
  if(p==='/api/status'||p==='/api/collection')return stats();
  if(p==='/api/products')return products(url.searchParams);
  if(/^\/api\/products\/\d+$/.test(p)){const period=Number(url.searchParams.get('period')||30);const r=detail(Number(p.split('/').at(-1)),[7,30,90].includes(period)?period:30);if(!r)throw Object.assign(new Error('Produit introuvable'),{status:404});return r;}
  if(p==='/api/niches'){const period=Number(url.searchParams.get('period')||30);return niches([7,30,90].includes(period)?period:30);}
  if(p==='/api/seeds')return {seeds:seeds().join('\n')};
  if(p==='/api/suggest'){const q=norm(url.searchParams.get('q'));return {rows:all('SELECT keyword FROM keywords WHERE active=1 AND keyword LIKE ? LIMIT 30','%'+q+'%')};}
 }
 if(req.method==='POST'){
  if(p==='/api/keyword')return analyze((await body(req)).keyword);
  if(p==='/api/collect'){
    const value=await body(req);
    const running=one("SELECT * FROM jobs WHERE status='running' ORDER BY id DESC LIMIT 1");
    if(running){try{process.kill(running.owner_pid,0);return {already_running:true};}catch{}}
    collect({bootstrap:!!value.bootstrap}).catch(()=>{});return {started:true};
  }
  if(p==='/api/seeds'){
    const value=await body(req),list=String(value.seeds||'').split('\n').map(norm).filter(Boolean);
    if(!list.length||list.length>200||list.some(k=>k.length>160))throw Object.assign(new Error('Saisir 1 à 200 mots-clés de 160 caractères maximum'),{status:400});
    const blocked=list.filter(hasTrademark),safe=list.filter(k=>!hasTrademark(k));
    if(!safe.length)throw Object.assign(new Error('Tous les mots-clés sont bloqués par la liste de marques'),{status:400});
    fs.writeFileSync(seedFile,[...new Set(safe)].join('\n')+'\n');
    run("UPDATE keywords SET active=0 WHERE source='seed'");syncSeeds();
    for(const k of safe)run('UPDATE keywords SET active=1 WHERE keyword=?',k);
    return {saved:true,seeds:[...new Set(safe)].join('\n'),blocked};
  }
  if(p==='/api/schedule'){
    const {hour}=await body(req);if(!Number.isInteger(hour)||hour<0||hour>23)throw Object.assign(new Error('Heure invalide'),{status:400});setSetting('collect_hour',hour);return {hour};
  }
 }
 throw Object.assign(new Error('Route introuvable'),{status:404});
}
module.exports={route,stats};
