// Live probe of the Etsy Open API v3 with your own key.
// Checks auth, rate-limit headers, and which fields the endpoints we rely on really return.
// Usage: node scripts/api-probe.mjs [keyword]   (reads ../.env, about 8 API calls)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createClient } = require('../src/etsy');
const client = createClient({ maxCalls: 8 });

const keyword = process.argv[2] || 'wedding planner template';
const report = { keyword, at: new Date().toISOString(), calls: [] };

async function get(path, params = {}) {
  const t = Date.now();
  const body = await client.get(path, params);
  const { status, limits } = client.lastResponse;
  report.calls.push({ path, status, ms: Date.now() - t, limits });
  console.log(status, path, JSON.stringify(limits));
  return body;
}

const days = (ts) => ts ? Math.round((Date.now() / 1000 - ts) / 86400) : null;

try {
  await get('/openapi-ping');

  // 1. Buyer taxonomy: find the digital-ish nodes we could crawl by category
  const tax = await get('/buyer-taxonomy/nodes');
  const flat = []; const walk = (n, path) => { const p = [...path, n.name]; flat.push({ id: n.id, level: n.level, path: p.join(' > ') }); (n.children || []).forEach((c) => walk(c, p)); };
  (tax.results || []).forEach((n) => walk(n, []));
  report.taxonomy = { total_nodes: flat.length, digital_like: flat.filter((n) => /digital|printable|template|pattern|svg|clip ?art|planner/i.test(n.path)).slice(0, 80) };

  // 2. Keyword search: how many results, how many are digital downloads
  const search = await get('/listings/active', { keywords: keyword, limit: 100, sort_on: 'score' });
  const rows = search.results || [];
  const digital = rows.filter((l) => l.listing_type === 'download');
  report.search = {
    count_total: search.count, returned: rows.length,
    listing_type_counts: rows.reduce((a, l) => ((a[l.listing_type] = (a[l.listing_type] || 0) + 1), a), {}),
    has_views_in_search: rows.some((l) => 'views' in l), fields_in_search: Object.keys(rows[0] || {}).sort(),
    sample: digital.slice(0, 5).map((l) => ({ id: l.listing_id, title: l.title.slice(0, 70), favs: l.num_favorers, price: l.price && l.price.amount / l.price.divisor, age_days: days(l.original_creation_timestamp), quantity: l.quantity })),
  };

  // 3. Batch listing details with Shop + Images in one call
  const ids = digital.slice(0, 20).map((l) => l.listing_id);
  if (ids.length) {
    const batch = await get('/listings/batch', { listing_ids: ids, includes: ['Shop', 'Images'] });
    const b = batch.results || [];
    report.batch = {
      requested: ids.length, returned: b.length,
      has_views: b.filter((l) => typeof l.views === 'number' && l.views > 0).length,
      has_shop: b.filter((l) => l.shop).length, has_images: b.filter((l) => (l.images || []).length).length,
      shop_fields: Object.keys(b.find((l) => l.shop)?.shop || {}).sort(),
      sample: b.slice(0, 5).map((l) => ({ id: l.listing_id, views: l.views, favs: l.num_favorers, shop: l.shop?.shop_name, shop_sales: l.shop?.transaction_sold_count, shop_digital_listings: l.shop?.digital_listing_count, shop_active: l.shop?.listing_active_count, shop_age_days: days(l.shop?.create_date), img: l.images?.[0]?.url_170x135 })),
    };

    // 4. Reviews: by shop (100 per call, tagged with listing_id) vs by listing
    const shopId = digital[0].shop_id;
    const since = Math.floor(Date.now() / 1000) - 30 * 86400;
    const sr = await get(`/shops/${shopId}/reviews`, { limit: 100, min_created: since });
    const lr = await get(`/listings/${ids[0]}/reviews`, { limit: 100, min_created: since });
    report.reviews = {
      shop_id: shopId, shop_reviews_30d: sr.count, shop_reviews_listing_ids: [...new Set((sr.results || []).map((r) => r.listing_id))].length,
      listing_id: ids[0], listing_reviews_30d: lr.count, review_fields: Object.keys((sr.results || [])[0] || {}).sort(),
    };

    // 5. Shop's own active listings (needed to split shop sales across its products)
    const sl = await get(`/shops/${shopId}/listings/active`, { limit: 100 });
    report.shop_listings = { count: sl.count, returned: (sl.results || []).length, digital: (sl.results || []).filter((l) => l.listing_type === 'download').length };
  }
  report.ok = true;
} catch (e) {
  process.exitCode = 1;
  report.ok = false; report.error = String(e.message || e);
  console.error(report.error);
}
mkdirSync(join(root, 'docs', 'niche-finder'), { recursive: true });
const out = join(root, 'docs', 'niche-finder', 'api-probe-result.json');
writeFileSync(out, JSON.stringify(report, null, 2));
console.log('\nSaved', out);
