// Etsy Keyword Tool - zero-dependency Node server (Node 18+)
// Data sources (all official / keyless):
//   - Etsy Open API v3   (ETSY_API_KEY)     -> competition, prices, shop ages, digital share
//   - Semrush API        (SEMRUSH_API_KEY)  -> Google volume, 12-month trend, KD, related keywords
//   - Google autocomplete (keyless)         -> sub keyword suggestions
// Nothing here scrapes etsy.com.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3456);
const ROOT = __dirname;
const ENV = loadEnv(path.join(ROOT, '.env'));
const ETSY_MOCK = (process.env.ETSY_MOCK || ENV.ETSY_MOCK) === '1';
const ETSY_KEY = ETSY_MOCK ? 'mock' : (process.env.ETSY_API_KEY || ENV.ETSY_API_KEY || '');
const SEMRUSH_KEY = process.env.SEMRUSH_API_KEY || ENV.SEMRUSH_API_KEY || '';
const SEMRUSH_DB = process.env.SEMRUSH_DB || ENV.SEMRUSH_DB || 'us';
const APP_PASSWORD = process.env.APP_PASSWORD || ENV.APP_PASSWORD || '';
const CACHE_FILE = path.join(ROOT, 'cache.json');
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

// ---------- tiny helpers ----------
function loadEnv(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
  return out;
}
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch {}
function cacheGet(k) {
  const e = cache[k];
  if (!e) return null;
  if (Date.now() - e.t > CACHE_TTL_MS) { delete cache[k]; return null; }
  return e.v;
}
let saveTimer = null;
function cacheSet(k, v) {
  cache[k] = { t: Date.now(), v };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(CACHE_FILE, JSON.stringify(cache), () => {}), 500);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ---------- Google autocomplete (keyless) ----------
async function googleSuggest(q) {
  const key = 'gs:' + norm(q);
  const hit = cacheGet(key); if (hit) return hit;
  const url = 'https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=' + encodeURIComponent(q);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return [];
    const j = await r.json();
    const out = Array.isArray(j[1]) ? j[1].map(norm) : [];
    cacheSet(key, out);
    return out;
  } catch { return []; }
}

async function expandKeyword(q, deep) {
  const seen = new Map();
  const clean = (kw) => norm(kw.replace(/\betsy\b/g, ' '));
  const add = (kw, src) => { kw = clean(kw); if (kw && kw !== norm(q) && !seen.has(kw)) seen.set(kw, src); };
  for (const s of await googleSuggest(q)) add(s, 'google');
  for (const s of await googleSuggest('etsy ' + q)) add(s, 'google:etsy');
  if (deep) {
    for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
      for (const s of await googleSuggest(q + ' ' + ch)) add(s, 'google:' + ch);
      await sleep(120);
    }
  }
  return [...seen.entries()].map(([keyword, source]) => ({ keyword, source }));
}

// ---------- Semrush ----------
function parseSemrushCsv(text) {
  const lines = text.trim().split('\n');
  if (!lines.length || /^ERROR/.test(lines[0])) return [];
  const head = lines[0].split(';');
  return lines.slice(1).map((l) => {
    const cells = l.split(';');
    const o = {}; head.forEach((h, i) => (o[h.trim()] = (cells[i] || '').trim())); return o;
  });
}
function semrushRow(o) {
  const trend = (o['Trends'] || '').split(',').map(Number).filter((n) => !Number.isNaN(n));
  return {
    keyword: norm(o['Keyword']),
    volume: o['Search Volume'] ? Number(o['Search Volume']) : null,
    kd: o['Keyword Difficulty Index'] ? Number(o['Keyword Difficulty Index']) : null,
    cpc: o['CPC'] ? Number(o['CPC']) : null,
    results: o['Number of Results'] ? Number(o['Number of Results']) : null,
    trend: trend.length === 12 ? trend : null,
  };
}
async function semrushOverview(q) {
  if (!SEMRUSH_KEY) return null;
  const key = 'sr:' + norm(q);
  const hit = cacheGet(key); if (hit) return hit;
  const url = `https://api.semrush.com/?type=phrase_this&key=${SEMRUSH_KEY}&phrase=${encodeURIComponent(q)}&database=${SEMRUSH_DB}&export_columns=Ph,Nq,Cp,Nr,Td,Kd`;
  try {
    const t = await (await fetch(url)).text();
    const rows = parseSemrushCsv(t).map(semrushRow);
    const v = rows[0] || { keyword: norm(q), volume: 0, kd: null, trend: null, results: null };
    cacheSet(key, v); return v;
  } catch { return null; }
}
async function semrushRelated(q, limit) {
  if (!SEMRUSH_KEY) return [];
  const key = 'srr:' + norm(q) + ':' + limit;
  const hit = cacheGet(key); if (hit) return hit;
  const url = `https://api.semrush.com/?type=phrase_fullsearch&key=${SEMRUSH_KEY}&phrase=${encodeURIComponent(q)}&database=${SEMRUSH_DB}&export_columns=Ph,Nq,Kd,Td&display_limit=${limit}&display_sort=nq_desc`;
  try {
    const t = await (await fetch(url)).text();
    const v = parseSemrushCsv(t).map(semrushRow);
    cacheSet(key, v); return v;
  } catch { return []; }
}

// ---------- Etsy Open API v3 ----------
// Deterministic fake data so the UI can be exercised without a key (ETSY_MOCK=1). Not real numbers.
function mockEtsy(pathname, params) {
  const seed = [...(pathname + JSON.stringify(params || {}))].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  let x = seed; const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const now = Math.floor(Date.now() / 1000);
  if (pathname === '/listings/active') {
    const n = 100, results = [];
    for (let i = 0; i < n; i++) results.push({ listing_id: seed % 100000 * 100 + i, title: `${params.keywords} design ${i + 1}`, url: 'https://www.etsy.com/listing/' + (seed % 100000 * 100 + i), price: { amount: Math.round(300 + rnd() * 2500), divisor: 100 }, num_favorers: Math.round(rnd() * 800), shop_id: 1000 + Math.floor(rnd() * 40), creation_timestamp: now - Math.floor(rnd() * 900) * 86400, listing_type: rnd() < 0.7 ? 'download' : 'physical' });
    return { count: Math.round(2000 + rnd() * 60000), results };
  }
  if (/^\/shops\/\d+$/.test(pathname)) return { shop_name: 'MockShop' + pathname.split('/')[2], transaction_sold_count: Math.round(rnd() * 8000), create_date: now - Math.floor(rnd() * 2000) * 86400, listing_active_count: Math.round(rnd() * 300), review_count: Math.round(rnd() * 900), review_average: 4.6 };
  if (/\/reviews$/.test(pathname)) { const c = Math.round(rnd() * 25); return { count: c, results: Array.from({ length: c }, () => ({ rating: rnd() < 0.12 ? 2 : 5, review: 'Mock review: file was hard to edit and sizing was unclear' })) }; }
  return {};
}
async function etsyGet(pathname, params) {
  if (ETSY_MOCK) { await sleep(5); return mockEtsy(pathname, params); }
  const url = new URL('https://openapi.etsy.com/v3/application' + pathname);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { 'x-api-key': ETSY_KEY } });
  if (!r.ok) throw new Error(`Etsy ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function etsyShop(shopId) {
  const key = 'shop:' + shopId;
  const hit = cacheGet(key); if (hit) return hit;
  try {
    const s = await etsyGet('/shops/' + shopId);
    const v = { shop_id: shopId, name: s.shop_name, sales: s.transaction_sold_count ?? null, created: s.create_date ?? s.created_timestamp ?? null, listings: s.listing_active_count ?? null, reviews: s.review_count ?? null, rating: s.review_average ?? null };
    cacheSet(key, v); return v;
  } catch { return { shop_id: shopId, sales: null, created: null }; }
}
// Reviews created in the last N days for one listing (Etsy API supports min_created, so this is one call).
async function etsyRecentReviews(listingId, days) {
  const key = `rev:${listingId}:${days}:${new Date().toISOString().slice(0, 10)}`;
  const hit = cacheGet(key); if (hit) return hit;
  const minCreated = Math.floor(Date.now() / 1000) - days * 86400;
  try {
    const r = await etsyGet(`/listings/${listingId}/reviews`, { limit: 100, min_created: minCreated });
    const rows = r.results || [];
    const low = rows.filter((x) => (x.rating || 5) <= 3);
    const v = { count: r.count ?? rows.length, low: low.length, samples: low.slice(0, 5).map((x) => (x.review || '').slice(0, 200)).filter(Boolean) };
    cacheSet(key, v); return v;
  } catch { return { count: null, low: 0, samples: [] }; }
}
const TRADEMARK = ['disney','mickey','minnie','marvel','pokemon','nintendo','mario','zelda','harry potter','hogwarts','taylor swift','swiftie','eras tour','barbie','bluey','peppa','paw patrol','stanley','nike','adidas','nfl','nba','mlb','nhl','star wars','lego','hello kitty','sanrio','friends tv','the office','grinch','dr seuss','minecraft','roblox','fortnite','stitch','frozen','elsa','spiderman','batman','superman','coca cola','starbucks','tiffany','louis vuitton','gucci','chanel','yeti','crocs','squishmallow','labubu'];
const hasTrademark = (kw) => TRADEMARK.some((t) => kw.includes(t));

async function etsyAnalyze(q, opts) {
  if (!ETSY_KEY) return null;
  const key = 'etsy:' + norm(q) + ':' + (opts.shops ? (opts.shopLimit || 30) : 0);
  const hit = cacheGet(key); if (hit) return hit;
  const data = await etsyGet('/listings/active', { keywords: q, limit: 100, sort_on: 'score' });
  const listings = data.results || [];
  const now = Date.now() / 1000;
  const prices = listings.map((l) => l.price && l.price.amount ? l.price.amount / (l.price.divisor || 100) : null).filter((p) => p != null);
  const ages = listings.map((l) => l.creation_timestamp ? (now - l.creation_timestamp) / 86400 : null).filter((a) => a != null);
  const digital = listings.filter((l) => l.listing_type === 'download' || l.listing_type === 'both').length;
  const favs = listings.map((l) => l.num_favorers || 0);
  const shopIds = [...new Set(listings.map((l) => l.shop_id).filter(Boolean))];
  let shops = [];
  if (opts.shops) {
    for (const id of shopIds.slice(0, opts.shopLimit || 30)) { shops.push(await etsyShop(id)); await sleep(110); }
  }
  const youngShops = shops.filter((s) => s.created && (now - s.created) / 86400 < 365).length;
  const smallShops = shops.filter((s) => s.sales != null && s.sales < 500).length;
  const bigShops = shops.filter((s) => s.sales != null && s.sales >= 5000).length;
  const v = {
    competition: data.count ?? null,
    sampled: listings.length,
    distinct_shops: shopIds.length,
    price_low: prices.length ? Math.min(...prices) : null,
    price_median: median(prices),
    price_high: prices.length ? Math.max(...prices) : null,
    digital_share: listings.length ? Math.round((100 * digital) / listings.length) : null,
    new_listings_90d: ages.filter((a) => a < 90).length,
    median_listing_age_days: median(ages) != null ? Math.round(median(ages)) : null,
    median_favorites: median(favs),
    shops_checked: shops.length,
    young_shops: opts.shops ? youngShops : null,
    small_shops: opts.shops ? smallShops : null,
    big_shops: opts.shops ? bigShops : null,
    top: listings.slice(0, 12).map((l) => ({
      listing_id: l.listing_id, title: l.title, url: l.url, price: l.price && l.price.amount ? l.price.amount / (l.price.divisor || 100) : null,
      favorites: l.num_favorers || 0, age_days: l.creation_timestamp ? Math.round((now - l.creation_timestamp) / 86400) : null,
      type: l.listing_type || null, shop: (shops.find((s) => s.shop_id === l.shop_id) || {}).name || l.shop_id,
      shop_sales: (shops.find((s) => s.shop_id === l.shop_id) || {}).sales ?? null,
    })),
  };
  cacheSet(key, v); return v;
}

// ---------- scoring ----------
// Difficulty 0-100 from Etsy competition + incumbency. Opportunity 0-100 from demand vs difficulty.
function score(sr, et) {
  let difficulty = null, opportunity = null, verdict = 'no data';
  if (et && et.competition != null) {
    const compScore = Math.min(100, Math.log10(Math.max(et.competition, 1)) * 20); // 10k -> 80, 1k -> 60
    let incumbency = 50;
    if (et.shops_checked) {
      const openShare = (et.young_shops + et.small_shops) / (2 * et.shops_checked);
      incumbency = Math.round(100 - openShare * 100);
    } else if (et.sampled) {
      incumbency = Math.round(100 - (et.new_listings_90d / et.sampled) * 100);
    }
    difficulty = Math.round(0.6 * compScore + 0.4 * incumbency);
  }
  const vol = sr && sr.volume != null ? sr.volume : null;
  if (vol != null && difficulty != null) {
    const demand = Math.min(100, Math.log10(Math.max(vol, 1)) * 25); // 10k -> 100, 1k -> 75, 100 -> 50
    opportunity = Math.round(Math.max(0, demand - difficulty * 0.6 + 20));
    opportunity = Math.min(100, opportunity);
    verdict = opportunity >= 65 ? 'strong' : opportunity >= 45 ? 'possible' : 'weak';
  } else if (difficulty != null) {
    verdict = difficulty < 55 ? 'open (no volume data)' : 'crowded (no volume data)';
  }
  return { difficulty, opportunity, verdict };
}

// ---------- niche finder ----------
const REVIEW_TO_SALES = 10; // assumption: about 1 review per 10 sales
function bucket(v, edges) { let i = 0; for (const e of edges) { if (v >= e) i++; } return i; }
async function validateNiche(kw, et, topN, sr) {
  const top = (et.top || []).slice(0, topN);
  const products = [];
  for (const t of top) {
    const r30 = await etsyRecentReviews(t.listing_id, 30); await sleep(110);
    products.push({ ...t, reviews_30d: r30.count, est_sales_mo: r30.count != null ? r30.count * REVIEW_TO_SALES : null,
      est_revenue_mo: r30.count != null && t.price != null ? Math.round(r30.count * REVIEW_TO_SALES * t.price) : null,
      rising: t.age_days != null && t.age_days < 180 && (r30.count || 0) >= 3 });
  }
  let low = 0, all = 0, samples = [];
  for (const t of top.slice(0, 2)) { const r90 = await etsyRecentReviews(t.listing_id, 90); await sleep(110); low += r90.low; all += r90.count || 0; samples.push(...r90.samples); }
  const velocity = products.reduce((a, p) => a + (p.reviews_30d || 0), 0);
  const openCount = (et.young_shops || 0) + (et.small_shops || 0);
  const demand = bucket(velocity, [5, 15, 30, 60, 100]);
  const openDoor = bucket(openCount, [1, 3, 5, 8, 12]);
  const digital = (et.digital_share || 0) >= 50;
  const pm = et.price_median || 0;
  const priceRoom = digital ? bucket(pm, [3, 6, 12]) : bucket(pm, [12, 20, 30]);
  const lowShare = all ? low / all : 0;
  const gap = lowShare >= 0.15 ? 2 : lowShare >= 0.07 ? 1 : 0;
  const volumeBonus = sr && sr.volume ? Math.min(2, Math.floor(Math.log10(sr.volume) - 1)) : 0; // 100 -> 1, 1000 -> 2
  const total = demand + openDoor + priceRoom + gap + volumeBonus;
  const verdict = total >= 10 && demand >= 2 && openDoor >= 2 ? 'WINNER' : total >= 8 ? 'near miss' : 'weak';
  return { keyword: kw, verdict, total, demand, open_door: openDoor, price_room: priceRoom, quality_gap: gap, volume_bonus: volumeBonus,
    velocity_30d: velocity, est_sales_mo_top: velocity * REVIEW_TO_SALES, competition: et.competition, distinct_shops: et.distinct_shops,
    young_shops: et.young_shops, small_shops: et.small_shops, big_shops: et.big_shops, price_median: et.price_median, price_low: et.price_low, price_high: et.price_high,
    digital_share: et.digital_share, new_listings_90d: et.new_listings_90d, google_volume: sr ? sr.volume : null, kd: sr ? sr.kd : null, trend: sr ? sr.trend : null,
    low_star_share: Math.round(lowShare * 100), complaints: samples.slice(0, 4), products, tag_ok: kw.length <= 20 };
}
async function nicheRun(q, opts, emit) {
  if (!ETSY_KEY) { emit('error', { message: 'Niche finder needs ETSY_API_KEY in .env (free at etsy.com/developers).' }); return; }
  emit('log', { msg: `Expanding "${q}"…` });
  const g = await expandKeyword(q, opts.deep);
  const s = await semrushRelated(q, 60);
  const map = new Map();
  for (const r of s) map.set(r.keyword, { keyword: r.keyword, source: 'semrush', volume: r.volume, kd: r.kd, trend: r.trend });
  for (const r of g) if (!map.has(r.keyword)) map.set(r.keyword, { keyword: r.keyword, source: r.source, volume: null, kd: null, trend: null });
  let cands = [...map.values()].filter((r) => r.keyword !== q && r.keyword.split(' ').length <= 6);
  const flagged = cands.filter((r) => hasTrademark(r.keyword)).map((r) => r.keyword);
  cands = cands.filter((r) => !hasTrademark(r.keyword));
  cands.sort((a, b) => (b.volume || 0) - (a.volume || 0));
  if (opts.includeRoot) cands.unshift({ keyword: q, source: 'root', volume: null, kd: null, trend: null });
  cands = cands.slice(0, opts.n);
  emit('log', { msg: `${cands.length} candidate phrases (${flagged.length} skipped for trademark risk). Screening on Etsy…` });
  const results = [];
  let i = 0;
  for (const c of cands) {
    i++;
    emit('progress', { i, n: cands.length, keyword: c.keyword });
    try {
      const et = await etsyAnalyze(c.keyword, { shops: true, shopLimit: 24 });
      if (!et || !et.sampled) { emit('log', { msg: `  ${c.keyword}: no listings` }); continue; }
      const sr = c.volume != null ? c : await semrushOverview(c.keyword);
      const v = await validateNiche(c.keyword, et, opts.top, sr);
      v.source = c.source;
      results.push(v);
      emit('niche', v);
    } catch (e) {
      emit('log', { msg: `  ${c.keyword}: ${e.message}` });
      if (/429/.test(e.message)) { emit('log', { msg: 'Rate limited by Etsy API, pausing 20s' }); await sleep(20000); }
    }
  }
  results.sort((a, b) => b.total - a.total || b.velocity_30d - a.velocity_30d);
  const products = results.flatMap((r) => r.products.map((p) => ({ ...p, niche: r.keyword }))).filter((p) => p.est_revenue_mo != null).sort((a, b) => b.est_revenue_mo - a.est_revenue_mo).slice(0, 40);
  emit('done', { keyword: q, niches: results, products, flagged, assumptions: { reviews_to_sales: REVIEW_TO_SALES } });
}

// ---------- routes ----------
async function handleApi(url) {
  const q = norm(url.searchParams.get('q'));
  if (!q) return { status: 400, body: { error: 'q required' } };
  const p = url.pathname;
  if (p === '/api/status') return { status: 200, body: { etsy: !!ETSY_KEY, semrush: !!SEMRUSH_KEY, db: SEMRUSH_DB } };
  if (p === '/api/suggest') {
    const deep = url.searchParams.get('deep') === '1';
    const g = await expandKeyword(q, deep);
    const s = await semrushRelated(q, 50);
    const map = new Map();
    for (const r of s) map.set(r.keyword, { keyword: r.keyword, source: 'semrush', volume: r.volume, kd: r.kd, trend: r.trend });
    for (const r of g) if (!map.has(r.keyword)) map.set(r.keyword, { keyword: r.keyword, source: r.source, volume: null, kd: null, trend: null });
    const rows = [...map.values()].filter((r) => r.keyword !== q);
    rows.sort((a, b) => (b.volume || 0) - (a.volume || 0) || a.keyword.localeCompare(b.keyword));
    return { status: 200, body: { keyword: q, count: rows.length, rows } };
  }
  if (p === '/api/keyword') {
    const withShops = url.searchParams.get('shops') !== '0';
    const [sr, et] = await Promise.all([
      semrushOverview(q),
      etsyAnalyze(q, { shops: withShops }).catch((e) => ({ error: e.message })),
    ]);
    return { status: 200, body: { keyword: q, tag_ok: q.length <= 20, semrush: sr, etsy: et, score: score(sr, et && !et.error ? et : null) } };
  }
  return { status: 404, body: { error: 'not found' } };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // Optional password gate (HTTP basic auth). Set APP_PASSWORD when the app is reachable from the internet.
  if (APP_PASSWORD) {
    const h = req.headers.authorization || '';
    const ok = h.startsWith('Basic ') && Buffer.from(h.slice(6), 'base64').toString().split(':').slice(1).join(':') === APP_PASSWORD;
    if (!ok) { res.writeHead(401, { 'www-authenticate': 'Basic realm="Etsy Keyword Tool"' }); return res.end('Password required'); }
  }
  try {
    if (url.pathname === '/api/niche') {
      const q = norm(url.searchParams.get('q'));
      if (!q) { res.writeHead(400); return res.end('q required'); }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const emit = (ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
      const opts = { n: Math.min(40, Number(url.searchParams.get('n') || 12)), top: Math.min(10, Number(url.searchParams.get('top') || 5)), deep: url.searchParams.get('deep') === '1', includeRoot: url.searchParams.get('root') !== '0' };
      nicheRun(q, opts, emit).catch((e) => emit('error', { message: e.message })).finally(() => res.end());
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/status') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ etsy: !!ETSY_KEY, mock: ETSY_MOCK, semrush: !!SEMRUSH_KEY, db: SEMRUSH_DB })); }
      const r = await handleApi(url);
      res.writeHead(r.status, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(r.body));
    }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const fp = path.join(ROOT, 'public', path.normalize(file));
    if (!fp.startsWith(path.join(ROOT, 'public'))) { res.writeHead(403); return res.end(); }
    fs.readFile(fp, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      const type = fp.endsWith('.html') ? 'text/html' : fp.endsWith('.js') ? 'text/javascript' : fp.endsWith('.css') ? 'text/css' : 'application/octet-stream';
      res.writeHead(200, { 'content-type': type }); res.end(buf);
    });
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}).listen(PORT, () => {
  console.log(`Etsy Keyword Tool on http://localhost:${PORT}${APP_PASSWORD ? ' (password protected)' : ''}`);
  console.log(`Etsy API: ${ETSY_MOCK ? 'MOCK DATA (ETSY_MOCK=1)' : ETSY_KEY ? 'on' : 'OFF (set ETSY_API_KEY in .env)'} | Semrush API: ${SEMRUSH_KEY ? 'on' : 'OFF (set SEMRUSH_API_KEY in .env)'}`);
});
