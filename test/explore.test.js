const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'etsy-explore-'));
process.env.DB_PATH=path.join(temp,'test.db');process.env.ETSY_MOCK='0';
process.env.ETSY_API_KEY='fixture-key';process.env.ETSY_SHARED_SECRET='fixture-secret';process.env.APP_PASSWORD='';
const e=require('../src/explore');
const {db,run,one,saveListing,saveKeyword,saveReviews,budget}=require('../src/db');
const {now,day}=require('../src/util');
after(()=>{db.close();fs.rmSync(temp,{recursive:true,force:true});});
const product=(id,extra={})=>({listing_id:id,shop_id:id,title:'Vintage junk journals kit',tags:['floral journal cards','digital download'],active:1,listing_type:'download',monthly_sales:30,monthly_revenue:300,price_usd:10,previous_sales:20,age_days:100,shop_age_days:120,shop_sales:1000,review_count:20,reviews_in_period:10,confidence:'Moyenne',...extra});
test('whole phrase membership, plurals, tags, links and digital/trademark eligibility',()=>{
 assert.equal(e.matchesPhrase(product(1),'JUNK JOURNAL'),true);
 assert.equal(e.matchesPhrase(product(1,{title:'junk journaling',tags:[]}),'junk journal'),false);
 assert.equal(e.matchesPhrase(product(1,{title:'notjunk journalistic',tags:[]}),'junk journal'),false);
 assert.equal(e.matchesPhrase(product(1,{title:'Floral cards',tags:['Junk Journals']}),'junk journal'),true);
 assert.equal(e.matchesPhrase(product(1,{title:'Floral cards',tags:[]}),'junk journal',new Set([1])),true);
 for(const bad of [{active:0},{listing_type:'both'},{listing_type:'physical'},{title:'Disney junk journal'}])assert.equal(e.matchesPhrase(product(1,bad),'junk journal',new Set([1])),false);
 assert.equal(e.matchesPhrase(product(1,{title:'junk',tags:['journal']}),'junk journal'),false);
 assert.equal(e.phraseMatcher('activity worksheet').test('ACTIVITY WORKSHEETS'),true);
 assert.equal(e.phraseMatcher('brush').test('brushes'),true);
});
test('extracts two-to-four word phrases, co-occurrences and HTML text',()=>{
 const phrases=e.extractPhrases(product(1,{title:'Christmas Junk Journal Kit, Birds &amp; Flowers'}),'junk journal');
 assert.ok(phrases.includes('christmas junk journal'));assert.ok(phrases.includes('junk journal kit'));assert.ok(phrases.includes('floral journal card'));
 assert.ok(phrases.every(p=>e.words(p).length>=2&&e.words(p).length<=4));
 assert.ok(!phrases.includes('junk journal'));assert.ok(!phrases.includes('kit bird'));
});
test('editable generic list and trademark phrases are filtered; qualified formats survive',()=>{
 for(const p of ['digital download','instant download','printable','commercial use','editable template','pdf pattern','canva template','Disney journal kit','Harry Potter planner'])assert.equal(e.isCandidate(p,'junk journal'),false,p);
 assert.equal(e.isCandidate('wedding canva template','junk journal'),true);
 assert.equal(e.isCandidate('vintage junk journal','junk journal'),true);
});
test('plural and word-order candidates merge before thresholding, preserving membership',()=>{
 assert.equal(e.canonicalKey('junk journal kits'),e.canonicalKey('journal kit junk'));
 const merged=e.mergeCandidates([{niche:'junk journal kits',ids:new Set([1,2]),monthly_revenue:200},{niche:'journal kit junk',ids:new Set([3]),monthly_revenue:300}]);
 assert.equal(merged.length,1);assert.equal(merged[0].niche,'journal kit junk');assert.deepEqual([...merged[0].ids],[1,2,3]);
});
test('80% Jaccard overlap merges into the higher-revenue name; nested markets remain distinct',()=>{
 const a=new Set([1,2,3,4,5,6,7,8,9,10]),b=new Set([1,2,3,4,5,6,7,8]);
 assert.equal(e.overlap(a,b),.8);
 const rows=e.mergeCandidates([{niche:'floral journal',ids:a,monthly_revenue:1000},{niche:'botanical pages',ids:b,monthly_revenue:2000}]);
 assert.equal(rows.length,1);assert.equal(rows[0].niche,'botanical pages');
 assert.equal(e.mergeCandidates([{niche:'floral journal',ids:a,monthly_revenue:2000},{niche:'bird pages',ids:new Set([1,2]),monthly_revenue:100}]).length,2);
});
test('sub-niches require eight listings and five shops, including exact boundaries',()=>{
 assert.equal(e.passesThreshold(Array.from({length:8},(_,i)=>product(i,{shop_id:i%5}))),true);
 assert.equal(e.passesThreshold(Array.from({length:7},(_,i)=>product(i))),false);
 assert.equal(e.passesThreshold(Array.from({length:8},(_,i)=>product(i,{shop_id:i%4}))),false);
 const rows=Array.from({length:20},(_,i)=>product(i,{title:i<10?'Vintage junk journal botanical cards':'Christmas junk journal festive cards',tags:[]}));
 const out=e.discoverSubniches(rows,'junk journal');
 assert.ok(out.subniches.length>=2);assert.ok(out.subniches.every(s=>s.listings>=8&&s.shops>=5));
 assert.ok(out.hidden_subniches>=0);assert.ok(out.subniches.every(s=>s.products.length<=3));
});
test('shop concentration aggregates whole shops and unknown revenue stays unknown',()=>{
 const ps=[product(1,{shop_id:1,monthly_revenue:300}),product(2,{shop_id:1,monthly_revenue:200}),product(3,{monthly_revenue:200}),product(4,{monthly_revenue:100}),product(5,{monthly_revenue:200}),product(6,{monthly_revenue:null,price_usd:null})];
 assert.equal(e.top3Share(ps),.9);assert.equal(e.top3Share([product(1,{monthly_revenue:null})]),null);
 const m=e.metrics(ps);assert.equal(m.monthly_revenue,1000);assert.equal(m.priced,5);assert.equal(m.young_shops_selling,5);
 assert.equal(e.metrics([product(1,{monthly_revenue:null,price_usd:null})]).monthly_revenue,null);
});
test('why-wins line uses observed period reviews, shop age and comparable price',()=>{
 assert.equal(e.whyWins(product(1,{shop_age_days:120,reviews_in_period:41,price_usd:20}),10,30),'Boutique de 4 mois, 41 avis en 30 j, prix 2× la médiane');
 assert.ok(e.whyWins(product(1,{reviews_in_period:7,shop_age_days:null}),10,7).includes('7 avis en 7 j'));
 assert.ok(e.whyWins(product(1,{price_usd:null}),10).includes('30 ventes/mois est.'));
 assert.equal(e.unescapeHtml('It&#39;s &amp; &#x1F44D;'),'It\'s & 👍');
});
test('product filters and revenue/sales/velocity/trend/new-riser ordering are independent',()=>{
 const ps=[product(1,{monthly_revenue:null,monthly_sales:1000,age_days:200,velocity:1,trend:null}),product(2,{monthly_revenue:500,monthly_sales:50,age_days:20,velocity:2,trend:20}),product(3,{monthly_revenue:100,monthly_sales:100,age_days:90,velocity:3,trend:40})];
 assert.deepEqual(e.rankProducts(ps).map(p=>p.listing_id),[2,3,1]);
 assert.deepEqual(e.rankProducts(ps,'sales').map(p=>p.listing_id),[1,3,2]);
 assert.deepEqual(e.rankProducts(ps,'velocity').map(p=>p.listing_id),[3,2,1]);
 assert.deepEqual(e.rankProducts(ps,'trend').map(p=>p.listing_id),[3,2,1]);
 assert.deepEqual(e.rankProducts(ps,'newest').map(p=>p.listing_id),[3,2]);
 assert.equal(e.filterProducts(ps,{min:11}).length,0);assert.equal(e.filterProducts(ps,{age:30,confidence:2}).length,1);
});
function seedFixture(){
 saveKeyword('junk journal','seed');saveKeyword('vintage junk journal cards','expansion');
 for(let i=1;i<=30;i++){
  const vintage=i<=15,title=vintage?'Vintage Junk Journals Cards':'Christmas Junk Journal Kit';
  saveListing({listing_id:i,shop_id:i,title,listing_type:'download',state:'active',language:i===15?'fr':'en-US',tags:['journal ephemera',vintage?'botanical cards':'festive papers'],original_creation_timestamp:now()-100*86400,price:{amount:1000,divisor:100,currency_code:'USD'},shop:{shop_name:'Fixture '+i,create_date:now()-120*86400,transaction_sold_count:1000,review_count:100}},'fixture');
  run("INSERT INTO estimates VALUES(?,?,30,?,?, 'reviews','Moyenne',10,100,12,0)",i,day(),i*10,i*100);
  run('INSERT INTO listing_keywords VALUES(?,?,0)',i,'junk journal');
  saveReviews([{transaction_id:i,listing_id:i,shop_id:i,create_timestamp:now()-2*86400,rating:2,review:'It&#39;s confusing &amp; incomplete.'}],i);
 }
 require('../src/analytics').invalidate();
}
test('HTTP Explorer is DB-only, ranked, period-aware, defaults English, narrows with repeatable sub and opens existing drawer',async()=>{
 seedFixture();const previous=global.fetch;let external=0;
 global.fetch=async (url,opts)=>{if(!String(url).startsWith('http://127.0.0.1:')){external++;throw new Error('External requests forbidden');}return previous(url,opts);};
 const server=require('../server').createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const used=budget().used,r=await (await fetch(base+'/api/explore?niche=junk%20journal')).json();
  assert.equal(r.coverage.tracked,29);assert.equal(r.products[0].listing_id,30);assert.ok(r.subniches.length>=2);assert.equal(r.path.length,1);
  assert.equal(r.products[0].reviews_in_period,1);assert.equal(r.products[0].listing_type,'download');assert.ok(r.products[0].why_wins);
  assert.ok(r.subniches.some(s=>s.complaints.some(c=>c.text==="It's confusing & incomplete.")));
  const child=r.subniches[0],drill=await (await fetch(base+'/api/explore?'+new URLSearchParams({niche:'junk journal',sub:child.niche}))).json();
  assert.equal(drill.total,child.listings);assert.equal(drill.summary.monthly_revenue,child.monthly_revenue);assert.equal(drill.path.length,2);
  assert.ok(drill.products.every(p=>r.products.some(parent=>parent.listing_id===p.listing_id)));
  assert.equal((await fetch(base+'/api/products/'+r.products[0].listing_id)).status,200);
  assert.equal((await fetch(base+'/api/explore?niche=disney')).status,400);assert.equal((await fetch(base+'/api/explore?niche=%21%21%21')).status,400);
  assert.equal((await fetch(base+'/api/explore?niche=junk%20journal&sub=unrelated%20niche')).status,200);
  assert.equal(budget().used,used);assert.equal(external,0);
 }finally{global.fetch=previous;await new Promise(r=>server.close(r));}
});
test('Explorer enrichment refuses before external requests and enforces reserve at every call',async()=>{
 run('INSERT OR REPLACE INTO api_calls VALUES(?,4200,800,?)',day(),'{}');let external=0;const previous=global.fetch;global.fetch=async()=>{external++;throw new Error('Forbidden');};
 try{
  await assert.rejects(e.fetchNiche('untracked digital planner'),err=>err.status===429&&err.message.includes('réserve'));
  const {reserveCall}=require('../src/etsy');assert.throws(()=>reserveCall(false,800),{code:'BUDGET'});
  assert.equal(e.explore(new URLSearchParams({niche:'junk journal'})).coverage.can_fetch,false);assert.equal(external,0);assert.equal(budget().remaining,800);
 }finally{global.fetch=previous;}
});
