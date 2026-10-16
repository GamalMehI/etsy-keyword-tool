const { MOCK }=require('./config');
const { all,one,run,transaction,saveListing,saveReviews,saveKeyword,setSetting }=require('./db');
const { now,day }=require('./util');
function seedMock() {
  if(!MOCK)throw new Error('Exemples interdits dans la base réelle');
  if(one('SELECT COUNT(*) AS n FROM listings').n && one('SELECT MAX(day) AS d FROM listing_snapshots').d===day())return;
  const t=now(),families=['goodnotes planner','budget spreadsheet','teacher printables','kids chore chart','wedding planner printable','crochet pattern','notion template','printable wall art','resume template','canva template','digital paper','meal planner printable'];
  const reviews=[];
  transaction(()=>{
    for(let f=0;f<families.length;f++){
      const kw=families[f];saveKeyword(kw,'seed');run('UPDATE keywords SET total_count=?,digital_share=.97,last_searched=? WHERE keyword=?',3200+f*3600,t,kw);
      for(let j=0;j<12;j++){
        const id=10000+f*12+j,sid=f<4?12000+f*12+j:2000+f*4+Math.floor(j/3),age=24+j*94+f*9,price=[12.9,8.5,19,5.9,14.5,7,9.9,24,4.5,15,6.9,11][j];
        for(let d=30;d>=0;d--){
          if(d>age)continue;
          const date=day((t-d*86400)*1000),sales=5000+f*700+Math.floor(j/3)*1700-d*(22+f*3);
          saveListing({listing_id:id,shop_id:sid,title:`${kw.replace(/\b\w/g,c=>c.toUpperCase())} · ${['Minimalist','Undated','Complete bundle','Editable','Weekly','Essential','All-in-one','Studio','Daily','Modern','Family','Simple'][j]} PDF`,url:`https://www.etsy.com/listing/${id}`,listing_type:'download',state:'active',language:j===11?'fr':'en-US',original_creation_timestamp:t-age*86400,price:{amount:Math.round(price*100),divisor:100,currency_code:'USD'},num_favorers:1200+j*277+f*19-d*(9+j),views:14000+j*990-d*(100+j*10),tags:[kw,`${kw} printable`,'digital download','editable template'],images:[{url_570xN:'/mock-product.svg'}],shop:{shop_name:`${['Paper','Studio','Little','Modern'][Math.floor(j/3)]}${['Nest','Ledger','Classroom','Habits','Vows','Wool','Notion','Botanical','Career','Canvas','Pages','Meals'][f]}`,create_date:t-((f<4?j:Math.floor(j/3))%3===0?240:1100+f*70)*86400,transaction_sold_count:sales,review_count:Math.round(sales/12),listing_active_count:f<4?1:3,digital_listing_count:f<4?1:3,review_average:4.8}},kw,date);
        }
        run('INSERT OR IGNORE INTO listing_keywords VALUES(?,?,?)',id,kw,j+1);
        for(let d=0;d<Math.min(180,age);d++){
          const n=((d+j*7+f*3)%11<3?1:0)+(j<3&&d%4===0?1:0);
          for(let z=0;z<n;z++)reviews.push({transaction_id:id*100000+d*10+z,shop_id:sid,listing_id:id,create_timestamp:t-d*86400-100,rating:d%19===0?2:5,review:d%19===0?'The editing instructions could be clearer.':'Clear files, easy to use.'});
        }
      }
    }
    run('UPDATE shops SET review_since=?,last_review_ts=?',t-180*86400,t);
    run('UPDATE shops SET last_review_ts=? WHERE shop_id % 13=0',t-2*86400);
    setSetting('mock_generated',t);
  });
  saveReviews(reviews);return {listings:144,shops:48,snapshot_days:31};
}
module.exports={seedMock};
