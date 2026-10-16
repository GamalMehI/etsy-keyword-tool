import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { collect }=require('../src/collector');
const result=await collect({bootstrap:process.argv.includes('--bootstrap')});
console.log(JSON.stringify(result,null,2));
if(result.status==='error')process.exitCode=1;
