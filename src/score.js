const { clamp }=require('./estimate');
const sum=a=>a.reduce((s,v)=>s+v,0);
const median=a=>{ const s=[...a].sort((a,b)=>a-b),m=s.length>>1; return s.length?s.length%2?s[m]:(s[m-1]+s[m])/2:0; };
const linear=(v,lo,hi)=>clamp((v-lo)/(hi-lo)*100,0,100);
const logScale=(v,lo,hi)=>linear(Math.log10(Math.max(1,v)),Math.log10(lo),Math.log10(hi));
function demandScore(sales,successes,volume=null) {
  const a=logScale(sales,50,20000),b=linear(successes,0,18);
  return volume==null ? (.5*a+.3*b)/.8 : .5*a+.3*b+.2*logScale(volume,100,100000);
}
function competitionScore(total,top3,bigShare,reviewMedian) { return .35*logScale(total,1000,500000)+.25*linear(top3,.2,.7)+.2*clamp(bigShare,0,1)*100+.2*linear(reviewMedian,20,2000); }
const openDoorScore=(youngListings,youngShops)=>linear(youngListings+youngShops,0,12);
const opportunityScore=(demand,competition,openDoor)=>clamp(demand,0,100)*(1-clamp(competition,0,100)/100)*.8+clamp(openDoor,0,100)*.2;
const verdict=(opportunity,demand,openDoor)=>opportunity>=50&&demand>=40&&openDoor>=25?'Foncer':opportunity>=35?'À creuser':'Éviter';
function scoreProducts(products,total=0,volume=null) {
  const top=[...products].sort((a,b)=>b.monthly_sales-a.monthly_sales).slice(0,48);
  const shops=new Map();
  for (const p of top) shops.set(p.shop_id,(shops.get(p.shop_id)||0)+(p.monthly_revenue||0));
  const revenue=sum([...shops.values()]), top3=revenue?sum([...shops.values()].sort((a,b)=>b-a).slice(0,3))/revenue:0;
  const youngListings=top.filter(p=>p.age_days<365&&p.monthly_sales>=10).length;
  const youngShops=new Set(top.filter(p=>p.shop_age_days<365).map(p=>p.shop_id)).size;
  const demand=demandScore(sum(top.map(p=>p.monthly_sales||0)),top.filter(p=>p.monthly_sales>=30).length,volume);
  const competition=competitionScore(total,top3,top.length?top.filter(p=>p.shop_sales>=5000).length/top.length:0,median(top.slice(0,24).map(p=>p.review_count||0)));
  const open_door=openDoorScore(youngListings,youngShops),opportunity=opportunityScore(demand,competition,open_door);
  return { demand:Math.round(demand),competition:Math.round(competition),open_door:Math.round(open_door),opportunity:Math.round(opportunity),verdict:verdict(opportunity,demand,open_door),top3_share:top3,young_listings:youngListings,young_shops:youngShops,sample:top.length };
}
module.exports={ linear,logScale,demandScore,competitionScore,openDoorScore,opportunityScore,verdict,scoreProducts };
