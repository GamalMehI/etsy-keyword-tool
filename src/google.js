const { cacheGet, cacheSet, norm, sleep } = require('./util');
async function googleSuggest(q) {
  const key = 'gs:' + norm(q);
  const hit = cacheGet(key); if (hit) return hit;
  const url = 'https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=' + encodeURIComponent(q);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) });
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


module.exports = { googleSuggest, expandKeyword };
