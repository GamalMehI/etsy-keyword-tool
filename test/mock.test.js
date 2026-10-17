const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const temp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'etsy-mock-test-'));
process.env.ETSY_MOCK='1';process.env.DB_PATH=path.join(temp,'mock.db');
const {db,one,all}=require('../src/db');
after(()=>{db.close();fs.rmSync(temp,{recursive:true,force:true});});
test('mock seeds 30 days of digital snapshots and a complete zero-network dashboard',async()=>{
 const previous=global.fetch;global.fetch=async()=>{throw new Error('Network forbidden in mock mode');};
 try{
  require('../src/mock').seedMock();require('../src/analytics').recompute();
  const stats=require('../src/routes').stats();assert.equal(stats.mock,true);assert.equal(stats.listings,216);assert.equal(stats.history_days,30);assert.equal(stats.snapshot_days,31);assert.ok(stats.reviews>5000);
  assert.equal(one("SELECT COUNT(*) n FROM listings WHERE listing_type<>'download'").n,0);
  const analytics=require('../src/analytics');
  for(const period of [7,30,90]){const ps=analytics.products(new URLSearchParams({period}));assert.ok(ps.total>100);assert.ok(ps.rows.every(p=>p.sales>=0&&Number.isFinite(p.monthly_sales)));assert.equal(analytics.detail(ps.rows[0].listing_id,period).chart.length,period);}
  assert.ok(analytics.niches(30).length>=12);
  const explored=require('../src/explore').explore(new URLSearchParams({niche:'digital planner'}));assert.ok(explored.subniches.length>=5);assert.ok(explored.products.length>0);
  for(const s of explored.subniches)assert.ok(s.listings>=8&&s.shops>=5);
  const report=await require('../src/keyword').analyze('goodnotes planner');assert.equal(report.calls,0);assert.equal(report.google,null);assert.ok(report.products.length>0);
  assert.deepEqual(new Set(all('SELECT DISTINCT confidence FROM estimates').map(r=>r.confidence)),new Set(['Basse','Moyenne','Haute']));
 }finally{global.fetch=previous;}
});
