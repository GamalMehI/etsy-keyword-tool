const { cacheGet, cacheSet, norm } = require('./util');
const { SEMRUSH_KEY, SEMRUSH_DB } = require('./config');
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
    const t = await (await fetch(url, { signal: AbortSignal.timeout(6000) })).text();
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
    const t = await (await fetch(url, { signal: AbortSignal.timeout(6000) })).text();
    const v = parseSemrushCsv(t).map(semrushRow);
    cacheSet(key, v); return v;
  } catch { return []; }
}


module.exports = { semrushOverview, semrushRelated };
