// Local, dependency-free Etsy Digital Niche Finder. Node 24+.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {timingSafeEqual,createHash}=require('node:crypto');
const {ROOT,MOCK,PORT,APP_PASSWORD}=require('./src/config');
const {route}=require('./src/routes');
const {recompute}=require('./src/analytics');
const {schedule}=require('./src/collector');
function createServer(){return http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(APP_PASSWORD){
   const auth=req.headers.authorization||'',provided=auth.startsWith('Basic ')?Buffer.from(auth.slice(6),'base64').toString().split(':').slice(1).join(':'):'';
   const digest=v=>createHash('sha256').update(v).digest();
   if(!timingSafeEqual(digest(provided),digest(APP_PASSWORD))){res.writeHead(401,{'www-authenticate':'Basic realm="Etsy Digital Niche Finder"'});return res.end('Mot de passe requis');}
 }
 // Reject cross-origin spending and DNS rebinding against a local credentialed app.
 if(!['localhost','127.0.0.1','[::1]'].includes((req.headers.host||'').replace(/:\d+$/,''))){res.writeHead(403);return res.end('Hôte interdit');}
 if(req.method!=='GET'&&req.method!=='HEAD'&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403);return res.end('Origine interdite');}
 try{
  if(url.pathname.startsWith('/api/')){
    const result=await route(req,url);res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});return res.end(JSON.stringify(result));
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
  const root=path.join(ROOT,'public'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';
  fs.readFile(file,(err,buf)=>{if(err){res.writeHead(404);return res.end('Introuvable');}res.writeHead(200,{'content-type':type+'; charset=utf-8'});res.end(buf);});
 }catch(e){res.writeHead(e.status|| (e.code==='BUDGET'?429:500),{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:e.message}));}
});}
if(require.main===module){
 if(MOCK)require('./src/mock').seedMock();recompute();require('./src/explore').warmExplore();
 const server=createServer();server.listen(PORT,'127.0.0.1',()=>console.log(`Etsy Digital Niche Finder : http://localhost:${PORT}${MOCK?' (données d’exemple)':''}`));
 schedule();
}
module.exports={createServer};
