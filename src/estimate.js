// Pure estimate math. Counts are proxies; shop totals never become exact product sales.
const DAY=86400;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number.isFinite(v)?v:lo));
const median=a=>{ const s=[...a].sort((a,b)=>a-b),m=s.length>>1; return s.length?s.length%2?s[m]:(s[m-1]+s[m])/2:12; };
const delta=(a,b,key)=>Math.max(0,(a?.[key] || 0)-(b?.[key] || 0));
function globalK(shops) {
  if (shops.length<30) return 12;
  const ks=shops.filter(s=>s.review_count>=20 && s.transaction_sold_count!=null).map(s=>clamp(s.transaction_sold_count/s.review_count,4,60));
  return ks.length ? median(ks) : 12;
}
function calibrateK({ sales, reviews, recentSales, recentReviews, historyDays=0, fallback=12 }) {
  if (historyDays>=30 && recentReviews>=10 && recentSales>=0) return clamp(recentSales/recentReviews,4,60);
  return reviews>=20 && sales!=null ? clamp(sales/reviews,4,60) : clamp(fallback,4,60);
}
function allocation({ shopSales, digitalFactor, listings, singleDigital=false }) {
  if (!listings.length) return {};
  if (singleDigital && listings.length===1) return { [listings[0].listing_id]:Math.max(0,shopSales) };
  const metrics=[['reviews90',.60],['favoriteGain',.25],['viewGain',.15]];
  const sums=metrics.map(([key])=>listings.reduce((s,l)=>s+Math.max(0,l[key]||0),0));
  // A missing signal has no evidence, so distribute its weight over available signals.
  const available=metrics.reduce((s,[,weight],i)=>s+(sums[i]>0?weight:0),0);
  return Object.fromEntries(listings.map(l=>[l.listing_id, Math.max(0,shopSales)*clamp(digitalFactor,0,1)*(available ? metrics.reduce((s,[key,weight],i)=>s+(sums[i]>0?weight*Math.max(0,l[key]||0)/sums[i]:0),0)/available : 0)]));
}
function confidence({ fullDelta, deltaDays=0, digitalListings=Infinity, reviewShare90=0, reviews=0, complete=true }) {
  if (!complete) return 'Basse';
  if (fullDelta && (digitalListings<=20 || reviewShare90>=.4)) return 'Haute';
  return deltaDays>=7 || reviews>=10 ? 'Moyenne' : 'Basse';
}
function estimate({ reviews=0, k=12, price=null, period=30, deltaSales=null, deltaDays=0, digitalListings=Infinity, reviewShare90=0, previousReviews=null, complete=true }) {
  const reviewSales=Math.max(0,reviews)*k, fullDelta=deltaSales!=null && deltaDays>=period && period>=7;
  const sales=fullDelta ? .7*Math.max(0,deltaSales)+.3*reviewSales : reviewSales;
  const previousSales=previousReviews==null?null:Math.max(0,previousReviews)*k;
  return { sales, revenue:price==null?null:sales*price, monthly_sales:sales*30/period, monthly_revenue:price==null?null:sales*price*30/period,
    previous_sales:previousSales, trend:previousSales>0?(sales/previousSales-1)*100:null,
    method:fullDelta?'blend':'reviews', confidence:confidence({ fullDelta,deltaDays,digitalListings,reviewShare90,reviews,complete }),k,coverage_days:deltaDays };
}
function badges(ageDays,monthlySales) { return [ageDays<90 && monthlySales>=20?'Viral':null,ageDays>730 && monthlySales>=30?'Classique':null].filter(Boolean); }
module.exports={ clamp, globalK, calibrateK, allocation, confidence, estimate, badges, delta, DAY };
