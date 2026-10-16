const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calibrateK,globalK,allocation,confidence,estimate,badges}=require('../src/estimate');
const {demandScore,competitionScore,openDoorScore,opportunityScore,verdict,scoreProducts,logScale}=require('../src/score');
test('K lifetime, default, clamping, median and recent calibration',()=>{
 assert.equal(calibrateK({sales:15800,reviews:1000}),15.8);
 assert.equal(calibrateK({sales:100,reviews:100}),4);
 assert.equal(calibrateK({sales:100000,reviews:100}),60);
 assert.equal(calibrateK({sales:200,reviews:19}),12);
 assert.equal(calibrateK({sales:200,reviews:19,fallback:15}),15);
 assert.equal(calibrateK({sales:15000,reviews:1000,recentSales:100,recentReviews:10,historyDays:30}),10);
 assert.equal(calibrateK({sales:15000,reviews:1000,recentSales:100,recentReviews:9,historyDays:30}),15);
 assert.equal(calibrateK({sales:15000,reviews:1000,recentSales:100,recentReviews:10,historyDays:29}),15);
 assert.equal(globalK(Array.from({length:29},()=>({transaction_sold_count:2000,review_count:100}))),12);
 assert.equal(globalK(Array.from({length:30},()=>({transaction_sold_count:2000,review_count:100}))),20);
});
test('shop allocation conserves eligible digital sales and handles missing signals',()=>{
 const listings=[{listing_id:1,reviews90:8,favoriteGain:6,viewGain:2},{listing_id:2,reviews90:2,favoriteGain:4,viewGain:8}];
 const a=allocation({shopSales:100,digitalFactor:.8,listings});assert.ok(Math.abs(a[1]-52.8)<1e-10);assert.ok(Math.abs(a[1]+a[2]-80)<1e-10);
 const b=allocation({shopSales:100,digitalFactor:.5,listings:listings.map(l=>({...l,favoriteGain:0,viewGain:0}))});assert.equal(b[1],40);assert.equal(b[2],10);
 assert.equal(allocation({shopSales:100,digitalFactor:0,listings:[{listing_id:1}],singleDigital:true})[1],100);
 assert.equal(allocation({shopSales:-1,digitalFactor:1,listings})[1],0);
 assert.equal(allocation({shopSales:100,digitalFactor:1,listings:[{listing_id:1}]})[1],0);
});
test('confidence follows full and partial coverage, concentration and review edges',()=>{
 assert.equal(confidence({fullDelta:true,digitalListings:20}),'Haute');
 assert.equal(confidence({fullDelta:true,digitalListings:21,reviewShare90:.4}),'Haute');
 assert.equal(confidence({fullDelta:true,digitalListings:21,reviewShare90:.39,deltaDays:30}),'Moyenne');
 assert.equal(confidence({deltaDays:7}),'Moyenne');assert.equal(confidence({reviews:10}),'Moyenne');assert.equal(confidence({reviews:9,deltaDays:6}),'Basse');
 assert.equal(confidence({fullDelta:true,digitalListings:1,complete:false}),'Basse');
});
test('blending, monthly normalization and missing comparison windows',()=>{
 const e=estimate({reviews:10,k:12,price:10,period:30,deltaSales:100,deltaDays:30,previousReviews:5});
 assert.equal(e.sales,106);assert.equal(e.revenue,1060);assert.equal(e.method,'blend');assert.ok(Math.abs(e.trend-76.6666667)<1e-5);
 assert.equal(estimate({reviews:7,k:12,period:7}).monthly_sales,360);
 assert.equal(estimate({reviews:10,k:12,period:90,deltaSales:500,deltaDays:30}).sales,120);
 assert.equal(estimate({reviews:10}).trend,null);assert.equal(estimate({reviews:10,previousReviews:0}).trend,null);
 assert.equal(estimate({reviews:10}).revenue,null);
 assert.deepEqual(badges(89,20),['Viral']);assert.deepEqual(badges(731,30),['Classique']);
});
test('all demand, competition, open-door and opportunity score edges',()=>{
 assert.equal(demandScore(0,0,null),0);assert.equal(demandScore(20000,18,null),100);assert.equal(demandScore(20000,18,100000),100);assert.equal(demandScore(50,0,100),0);
 assert.equal(competitionScore(0,0,0,0),0);assert.equal(competitionScore(500000,.7,1,2000),100);
 assert.equal(openDoorScore(0,0),0);assert.equal(openDoorScore(6,6),100);assert.equal(openDoorScore(100,100),100);
 assert.equal(opportunityScore(100,0,100),100);assert.equal(opportunityScore(100,100,0),0);assert.equal(opportunityScore(0,0,100),20);
 assert.equal(verdict(50,40,25),'Foncer');assert.equal(verdict(50,39,25),'À creuser');assert.equal(verdict(35,0,0),'À creuser');assert.equal(verdict(34.9,100,100),'Éviter');
 assert.equal(logScale(-5,100,1000),0);assert.equal(logScale(10000,100,1000),100);
 assert.equal(scoreProducts([]).demand,0);assert.equal(scoreProducts([]).verdict,'Éviter');
});
test('shop concentration counts shops rather than top products',()=>{
 const rows=Array.from({length:48},(_,i)=>({listing_id:i,shop_id:i<40?1:i,monthly_sales:50,monthly_revenue:100,age_days:200,shop_age_days:500,shop_sales:6000,review_count:60}));
 assert.equal(scoreProducts(rows,10000).top3_share,42/48);
});
