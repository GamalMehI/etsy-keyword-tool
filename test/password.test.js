const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const temp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'etsy-password-'));
process.env.DB_PATH=path.join(temp,'test.db');process.env.APP_PASSWORD='fixture-password';process.env.ETSY_MOCK='0';
const {db}=require('../src/db');
after(()=>{db.close();fs.rmSync(temp,{recursive:true,force:true});});
test('password option protects assets and API, accepting any username with the correct password',async()=>{
 const server=require('../server').createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const p of ['/','/api/status'])assert.equal((await fetch(base+p)).status,401);
  assert.equal((await fetch(base+'/api/status',{headers:{authorization:'Basic '+Buffer.from('any:wrong').toString('base64')}})).status,401);
  assert.equal((await fetch(base+'/api/status',{headers:{authorization:'Basic '+Buffer.from('any:fixture-password').toString('base64')}})).status,200);
 }finally{await new Promise(r=>server.close(r));}
});
