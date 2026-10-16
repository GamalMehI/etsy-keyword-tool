const { ETSY_KEY, ETSY_SECRET, MOCK, RESERVE } = require('./config');
const { run, one, transaction, budget } = require('./db');
const { sleep, day } = require('./util');
class BudgetError extends Error { constructor(message='Réserve API atteinte') { super(message); this.code='BUDGET'; } }
// A persisted gate coordinates CLI + HTTP workers, including retries. No burst tokens.
function reserveCall(background) {
  return transaction(() => {
    const b=budget();
    if (b.remaining <= (background ? RESERVE : 0)) throw new BudgetError();
    const t=Date.now(), slot=Math.max(t,one('SELECT next_at FROM api_gate WHERE id=1').next_at);
    run('UPDATE api_gate SET next_at=? WHERE id=1',slot+260);
    run(`INSERT INTO api_calls(day,used,remaining_reported,last_headers) VALUES(?,1,NULL,'{}') ON CONFLICT(day) DO UPDATE SET used=used+1,remaining_reported=CASE WHEN remaining_reported IS NULL THEN NULL ELSE MAX(0,remaining_reported-1) END`,day());
    return slot-t;
  });
}
function recordHeaders(headers) {
  const names=['x-limit-per-second','x-remaining-this-second','x-limit-per-day','x-remaining-today'];
  const h=Object.fromEntries(names.flatMap(k => headers.has(k) ? [[k,headers.get(k)]] : []));
  const raw=h['x-remaining-today'], remain=raw != null && Number.isFinite(Number(raw)) ? Number(raw) : null;
  transaction(() => run(`UPDATE api_calls SET remaining_reported=CASE WHEN ? IS NULL THEN remaining_reported WHEN remaining_reported IS NULL THEN ? ELSE MIN(remaining_reported,?) END,last_headers=? WHERE day=?`,remain,remain,remain,JSON.stringify(h),day()));
}
function createClient({ background=false, maxCalls=Infinity, deadline=Infinity, fetchImpl=fetch, sleepImpl=sleep }={}) {
  let calls=0,lastResponse=null;
  return { get calls() { return calls; }, get lastResponse() { return lastResponse; }, async get(pathname,params={}) {
    if (!/^\/(?:listings|shops|buyer-taxonomy|openapi-ping)(?:\/|$)/.test(pathname) || pathname.includes('..')) throw new Error('Endpoint Etsy interdit');
    if (MOCK) throw new Error('Le mode exemple utilise uniquement sa base locale');
    if (!ETSY_KEY || !ETSY_SECRET) throw new Error('Configurer ETSY_API_KEY et ETSY_SHARED_SECRET dans .env');
    const url=new URL('https://openapi.etsy.com/v3/application'+pathname);
    for (const [k,v] of Object.entries(params)) url.searchParams.set(k,Array.isArray(v)?v.join(','):v);
    for (let attempt=0;attempt<4;attempt++) {
      if (calls>=maxCalls || Date.now()>=deadline) throw new BudgetError('Limite de cette opération atteinte');
      const wait=reserveCall(background); calls++;
      await sleepImpl(wait);
      if (Date.now()>=deadline) throw new BudgetError('Délai de cette opération atteint');
      // Recheck at dispatch as well: a suspended event loop must never release a burst.
      let event;
      while(event==null){
        const gate=transaction(()=>{
          const last=one('SELECT ts FROM api_events ORDER BY ts DESC LIMIT 1')?.ts||0;
          const pause=Math.max(0,last+260-Date.now());
          if(pause)return {pause};
          return {id:run('INSERT INTO api_events(day,ts,endpoint,status,background) VALUES(?,?,?,NULL,?)',day(),Date.now(),pathname,background?1:0).lastInsertRowid};
        });
        if(gate.id!=null)event=gate.id;else await sleep(gate.pause);
        if(Date.now()>=deadline)throw new BudgetError('Délai de cette opération atteint');
      }
      let r;
      try { r=await fetchImpl(url,{ headers:{ 'x-api-key':`${ETSY_KEY}:${ETSY_SECRET}` }, signal:AbortSignal.timeout(Math.min(20000,Math.max(1,deadline-Date.now()))) }); }
      catch {
        if(attempt<3 && Date.now()+1000*2**attempt<deadline){await sleepImpl(1000*2**attempt);continue;}
        throw new Error('Etsy indisponible ou délai dépassé');
      }
      recordHeaders(r.headers);
      run('UPDATE api_events SET status=? WHERE id=?',r.status,event);
      lastResponse={path:pathname,status:r.status,limits:Object.fromEntries([...r.headers].filter(([k])=>k.startsWith('x-limit')||k.startsWith('x-remaining')))};
      if ((r.status===429 || r.status>=500) && attempt<3) { const retry=Number(r.headers.get('retry-after')) || 0; await sleepImpl(Math.min(15000,Math.max(retry*1000,1000*2**attempt))); continue; }
      // Never include remote bodies or headers in errors: credentials cannot leak via a remote echo.
      if (!r.ok) { const e=new Error(`Etsy HTTP ${r.status}`); e.status=r.status; throw e; }
      return r.json();
    }
  }};
}
module.exports = { createClient, BudgetError, reserveCall, recordHeaders };
