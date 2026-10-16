const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'etsy-tests-'));
process.env.DB_PATH=path.join(temp,'test.db');process.env.ETSY_MOCK='0';process.env.ETSY_API_KEY='test-key';process.env.ETSY_SHARED_SECRET='test-secret';process.env.APP_PASSWORD='';
const {db,run,one,all,saveListing,saveReviews,transaction,budget}=require('../src/db');
const {day,now}=require('../src/util');
const {createClient,reserveCall,recordHeaders}=require('../src/etsy');
const {recompute,products,invalidate}=require('../src/analytics');
function resetQuota(){run('DELETE FROM api_calls');run('UPDATE api_gate SET next_at=0');}
after(()=>{db.close();fs.rmSync(temp,{recursive:true,force:true});});
test('only download listings enter storage; review storage excludes buyer identities',()=>{
 const sample={listing_id:1,shop_id:1,title:'Digital planner',listing_type:'physical',price:{amount:1000,divisor:100,currency_code:'USD'}};
 assert.equal(saveListing(sample),false);assert.equal(saveListing({...sample,listing_type:'both'}),false);
 assert.equal(saveListing({...sample,listing_type:'download',title:'Disney planner'}),false);
 assert.equal(saveListing({...sample,listing_type:'download'}),true);
 assert.equal(one('SELECT COUNT(*) n FROM listings').n,1);
 assert.throws(()=>run("INSERT INTO listings(listing_id,listing_type) VALUES(2,'physical')"));
 saveReviews([{transaction_id:1,shop_id:1,listing_id:1,create_timestamp:now(),rating:5,review:'Fine',buyer_user_id:999}],1);
 assert.equal(all('PRAGMA table_info(reviews)').some(c=>c.name==='buyer_user_id'),false);
 assert.equal(Object.values(one('SELECT * FROM reviews')).includes(999),false);
});
test('persisted 4/sec gate spaces concurrent API starts; auth uses the secret',async()=>{
 resetQuota();const starts=[];
 const client=createClient({fetchImpl:async(url,opts)=>{
  assert.equal(url.origin,'https://openapi.etsy.com');assert.equal(opts.headers['x-api-key'],'test-key:test-secret');starts.push(Date.now());return new Response('{"results":[]}',{headers:{'x-limit-per-day':'5000'}});
 }});
 await Promise.all(Array.from({length:5},()=>client.get('/listings/active')));
 starts.sort((a,b)=>a-b);assert.ok(starts[4]-starts[0]>=1000,JSON.stringify(starts));assert.equal(budget().used,5);
 await assert.rejects(client.get('/../etsy.com'),/interdit/);
});
test('daily reserve, header budget and interactive allowance survive client recreation',()=>{
 resetQuota();run('INSERT INTO api_calls VALUES(?,4199,801,?)',day(),'{}');
 reserveCall(true);assert.equal(budget().remaining,800);assert.throws(()=>reserveCall(true),{code:'BUDGET'});
 reserveCall(false);assert.equal(budget().remaining,799);
 recordHeaders(new Headers({'x-remaining-today':'700','x-limit-per-day':'5000'}));assert.equal(budget().remaining,700);
 // Late responses can never restore a budget already spent by another process.
 recordHeaders(new Headers({'x-remaining-today':'900'}));assert.equal(budget().remaining,700);
 const child=require('node:child_process').execFileSync(process.execPath,['-e',"const {budget}=require('./src/db');process.stdout.write(String(budget().remaining));"],{cwd:path.resolve(__dirname,'..'),env:process.env,encoding:'utf8'});assert.equal(Number(child),700);
 resetQuota();run('INSERT INTO api_calls VALUES(?,1,2,?)',day(),'{}');reserveCall(false);reserveCall(false);assert.throws(()=>reserveCall(false),{code:'BUDGET'});
});
test('429 backs off exponentially with at most three retries, safely redacts remote bodies',async()=>{
 resetQuota();const waits=[];let count=0;
 const client=createClient({sleepImpl:async ms=>waits.push(ms),fetchImpl:async()=>{count++;return new Response('do not expose remote error text',{status:429});}});
 await assert.rejects(client.get('/listings/active'),/^Error: Etsy HTTP 429$/);assert.equal(count,4);assert.ok(waits.includes(1000));assert.ok(waits.includes(2000));assert.ok(waits.includes(4000));
 resetQuota();const capped=createClient({maxCalls:1,sleepImpl:async()=>{},fetchImpl:async()=>new Response('{}')});await capped.get('/openapi-ping');await assert.rejects(capped.get('/openapi-ping'),{code:'BUDGET'});
});
test('20,000 listings load from SQLite in under one second including cold query and sorting',()=>{
 run('DELETE FROM listings');run('DELETE FROM listing_snapshots');run('DELETE FROM reviews');
 const listing=db.prepare("INSERT INTO listings(listing_id,shop_id,title,price_usd,tags,language,created_ts,active,listing_type) VALUES(?,?,'Digital planner',10,'[]','en-US',?,1,'download')");
 const snap=db.prepare('INSERT INTO listing_snapshots VALUES(?,?,1000,10000,10)');
 const estimate=db.prepare("INSERT OR REPLACE INTO estimates VALUES(?,?,30,100,1000,'reviews','Moyenne',80,25,12,0)");
 const review=db.prepare("INSERT INTO reviews VALUES(?,?,?,?,5,'Review')");
 transaction(()=>{
  for(let i=1;i<=20000;i++){listing.run(i,Math.ceil(i/10),now()-100*86400);snap.run(i,day());estimate.run(i,day());for(let j=0;j<5;j++)review.run(i*10+j,Math.ceil(i/10),i,now()-j*86400);}
 });
 invalidate();const start=performance.now(),result=products(new URLSearchParams('limit=50'));const elapsed=performance.now()-start;
 assert.equal(result.total,20000);assert.equal(result.rows.length,50);assert.ok(elapsed<1000,`Cold product query: ${elapsed.toFixed(1)} ms`);console.log(`20,000 products cold DB response: ${elapsed.toFixed(1)} ms`);
});
test('fresh tracked keyword reuse preserves normalized listing metadata and spends no Etsy calls',async()=>{
 const {saveShop,saveKeyword}=require('../src/db');
 for(let i=1;i<=6;i++)saveShop({shop_id:i,shop_name:'Fixture Shop',create_date:now()-800*86400,transaction_sold_count:12000,review_count:1000,digital_listing_count:10,listing_active_count:10});
 run('UPDATE listings SET image_url=? WHERE listing_id<=60','https://i.etsystatic.com/example.jpg');
 run('UPDATE shops SET last_review_ts=?,review_since=?',now(),now()-90*86400);
 saveKeyword('test digital planner','seed');run('UPDATE keywords SET last_searched=?,total_count=10000,digital_share=1 WHERE keyword=?',now(),'test digital planner');
 for(let i=1;i<=60;i++)run('INSERT OR IGNORE INTO listing_keywords VALUES(?,?,?)',i,'test digital planner',i);
 const before=one('SELECT created_ts,tags,price_usd FROM listings WHERE listing_id=1');
 const original=global.fetch;let etsyCalls=0;
 global.fetch=async url=>{if(String(url).includes('openapi.etsy.com')){etsyCalls++;throw new Error('Unexpected Etsy request');}return new Response('["",[]]');};
 try{
  const report=await require('../src/keyword').analyze('test digital planner');assert.equal(report.calls,0);assert.equal(etsyCalls,0);assert.equal(report.products.length,48);
  assert.deepEqual(one('SELECT created_ts,tags,price_usd FROM listings WHERE listing_id=1'),before);
  assert.ok(report.products.every(p=>Array.isArray(p.tags)));
  assert.equal((await require('../src/keyword').analyze('test digital planner')).cached,true);
 }finally{global.fetch=original;}
});
test('HTTP API, local host/origin protection and static assets',async()=>{
 const server=require('../server').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const root=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const p of ['/','/app.js','/style.css','/api/status','/api/products','/api/niches'])assert.equal((await fetch(root+p)).status,200,p);
  assert.equal((await fetch(root+'/api/products?age=30')).status,200);
  assert.equal((await fetch(root+'/api/collect',{method:'POST',headers:{origin:'https://other.example'}})).status,403);
  assert.equal(await new Promise((resolve,reject)=>{const req=require('node:http').get(root+'/api/status',{headers:{host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);}),403);
  assert.equal((await fetch(root+'/api/keyword',{method:'POST',body:JSON.stringify({keyword:'disney'})})).status,400);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
