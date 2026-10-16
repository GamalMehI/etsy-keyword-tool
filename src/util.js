const fs = require('node:fs');
const path = require('node:path');
const { ROOT, MOCK, DB_PATH } = require('./config');
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const median = a => { const s = a.filter(Number.isFinite).sort((a,b) => a-b); const m = s.length >> 1; return s.length ? s.length % 2 ? s[m] : (s[m-1]+s[m])/2 : 0; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const day = (ts = Date.now()) => new Date(ts).toISOString().slice(0, 10);
const now = () => Math.floor(Date.now() / 1000);
const cacheFile = path.join(path.dirname(DB_PATH), MOCK ? 'mock-cache.json' : 'cache.json');
let cache = {};
try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {
  if (!MOCK) try { cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'cache.json'), 'utf8')); } catch {}
}
const cacheGet = k => cache[k] && Date.now() - cache[k].t < 7*86400000 ? cache[k].v : null;
function cacheSet(k, v) { cache[k] = { t: Date.now(), v }; fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(cache)); }
const chunks = (a,n=100) => Array.from({length: Math.ceil(a.length/n)}, (_,i) => a.slice(i*n,(i+1)*n));
module.exports = { norm, median, sleep, day, now, cacheGet, cacheSet, chunks };
