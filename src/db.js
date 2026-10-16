const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { DB_PATH } = require('./config');
const { day, now } = require('./util');
const { hasTrademark } = require('./trademark');
function openDb(file = DB_PATH) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;
    CREATE TABLE IF NOT EXISTS listings(listing_id INTEGER PRIMARY KEY, shop_id INTEGER, title TEXT, url TEXT, image_url TEXT, price_usd REAL, taxonomy_id INTEGER, tags TEXT, language TEXT, created_ts INTEGER, first_seen INTEGER, last_seen INTEGER, active INTEGER, discovered_via TEXT, listing_type TEXT NOT NULL CHECK(listing_type='download'));
    CREATE TABLE IF NOT EXISTS listing_snapshots(listing_id INTEGER, day TEXT, num_favorers INTEGER, views INTEGER, price_usd REAL, PRIMARY KEY(listing_id,day));
    CREATE TABLE IF NOT EXISTS shops(shop_id INTEGER PRIMARY KEY, shop_name TEXT, url TEXT, icon_url TEXT, created_ts INTEGER, first_seen INTEGER, last_seen INTEGER, last_review_ts INTEGER DEFAULT 0, review_since INTEGER, backfill_offset INTEGER DEFAULT 0, last_expanded INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS shop_snapshots(shop_id INTEGER, day TEXT, transaction_sold_count INTEGER, review_count INTEGER, listing_active_count INTEGER, digital_listing_count INTEGER, num_favorers INTEGER, review_average REAL, PRIMARY KEY(shop_id,day));
    CREATE TABLE IF NOT EXISTS reviews(transaction_id INTEGER PRIMARY KEY, shop_id INTEGER, listing_id INTEGER, created_ts INTEGER, rating INTEGER, text TEXT);
    CREATE INDEX IF NOT EXISTS reviews_shop_date ON reviews(shop_id,created_ts);
    CREATE INDEX IF NOT EXISTS reviews_listing_date ON reviews(listing_id,created_ts);
    CREATE TABLE IF NOT EXISTS keywords(keyword TEXT PRIMARY KEY, source TEXT, digital_share REAL, total_count INTEGER, first_seen INTEGER, last_searched INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS listing_keywords(listing_id INTEGER, keyword TEXT, best_rank INTEGER, PRIMARY KEY(listing_id,keyword));
    CREATE INDEX IF NOT EXISTS lk_keyword ON listing_keywords(keyword,listing_id);
    CREATE TABLE IF NOT EXISTS estimates(listing_id INTEGER, day TEXT, period INTEGER, sales REAL, revenue REAL, method TEXT, confidence TEXT, previous_sales REAL, trend REAL, k REAL, coverage_days INTEGER, PRIMARY KEY(listing_id,day,period));
    CREATE INDEX IF NOT EXISTS estimates_rank ON estimates(day,period,revenue DESC);
    CREATE TABLE IF NOT EXISTS keyword_reports(keyword TEXT, day TEXT, report TEXT, PRIMARY KEY(keyword,day));
    CREATE TABLE IF NOT EXISTS api_calls(day TEXT PRIMARY KEY, used INTEGER, remaining_reported INTEGER, last_headers TEXT);
    CREATE TABLE IF NOT EXISTS api_events(id INTEGER PRIMARY KEY,day TEXT,ts INTEGER,endpoint TEXT,status INTEGER,background INTEGER);
    CREATE INDEX IF NOT EXISTS api_event_time ON api_events(ts);
    CREATE TABLE IF NOT EXISTS api_gate(id INTEGER PRIMARY KEY, next_at INTEGER);
    INSERT OR IGNORE INTO api_gate VALUES(1,0);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY, started INTEGER, finished INTEGER, status TEXT, step TEXT, calls INTEGER DEFAULT 0, message TEXT, owner_pid INTEGER);
    CREATE TABLE IF NOT EXISTS listing_types(listing_id INTEGER PRIMARY KEY, listing_type TEXT);
    CREATE TABLE IF NOT EXISTS review_coverage(listing_id INTEGER PRIMARY KEY, since_ts INTEGER, until_ts INTEGER);
    CREATE INDEX IF NOT EXISTS listings_shop ON listings(shop_id);
    CREATE INDEX IF NOT EXISTS ss_day ON shop_snapshots(day);
  `);
  if (!db.prepare('PRAGMA table_info(shops)').all().some(c=>c.name==='backfill_until')) db.exec('ALTER TABLE shops ADD COLUMN backfill_until INTEGER');
  return db;
}
const db = openDb();
const run = (sql,...args) => db.prepare(sql).run(...args);
const all = (sql,...args) => db.prepare(sql).all(...args);
const one = (sql,...args) => db.prepare(sql).get(...args);
function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const r=fn(); db.exec('COMMIT'); return r; } catch(e) { db.exec('ROLLBACK'); throw e; } }
const setting = (key, fallback=null) => { const row=one('SELECT value FROM settings WHERE key=?',key); return row ? JSON.parse(row.value) : fallback; };
const setSetting = (key,value) => run('INSERT OR REPLACE INTO settings VALUES(?,?)',key,JSON.stringify(value));
function saveKeyword(keyword, source='expansion') {
  if (!keyword || hasTrademark(keyword)) return false;
  run('INSERT OR IGNORE INTO keywords(keyword,source,first_seen) VALUES(?,?,?)',keyword,source,now()); return true;
}
function saveListing(l, via='batch', date=day()) {
  run('INSERT OR REPLACE INTO listing_types VALUES(?,?)',l.listing_id,l.listing_type || 'unknown');
  if (l.listing_type !== 'download' || hasTrademark(l.title)) {
    run('UPDATE listings SET active=0 WHERE listing_id=?',l.listing_id); return false;
  }
  const price=l.price?.currency_code && l.price.currency_code !== 'USD' ? null : l.price ? l.price.amount/(l.price.divisor || 100) : null;
  const image=(l.images || l.Images || [])[0];
  run(`INSERT INTO listings VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(listing_id) DO UPDATE SET
    shop_id=excluded.shop_id,title=excluded.title,url=excluded.url,image_url=COALESCE(NULLIF(excluded.image_url,''),listings.image_url),price_usd=COALESCE(excluded.price_usd,listings.price_usd),taxonomy_id=excluded.taxonomy_id,tags=excluded.tags,language=excluded.language,created_ts=excluded.created_ts,last_seen=excluded.last_seen,active=excluded.active`,
    l.listing_id,l.shop_id,l.title,l.url || `https://www.etsy.com/listing/${l.listing_id}`,image?.url_570xN || image?.url_170x135 || '',price,l.taxonomy_id || 0,JSON.stringify(l.tags || []),l.language || 'unknown',l.original_creation_timestamp || l.creation_timestamp || l.created_timestamp || now(),now(),now(),l.state && l.state !== 'active' ? 0 : 1,via,'download');
  run('INSERT OR REPLACE INTO listing_snapshots VALUES(?,?,?,?,?)',l.listing_id,date,l.num_favorers || 0,l.views ?? null,price);
  const s=l.shop || l.Shop;
  if (s) saveShop({ ...s, shop_id:l.shop_id },date);
  return true;
}
function saveShop(s,date=day()) {
  run(`INSERT INTO shops(shop_id,shop_name,url,icon_url,created_ts,first_seen,last_seen) VALUES(?,?,?,?,?,?,?) ON CONFLICT(shop_id) DO UPDATE SET shop_name=excluded.shop_name,url=excluded.url,icon_url=excluded.icon_url,created_ts=excluded.created_ts,last_seen=excluded.last_seen`,s.shop_id,s.shop_name || '',s.url || '',s.icon_url_fullxfull || '',s.create_date || s.created_timestamp || null,now(),now());
  run('INSERT OR REPLACE INTO shop_snapshots VALUES(?,?,?,?,?,?,?,?)',s.shop_id,date,s.transaction_sold_count ?? null,s.review_count ?? null,s.listing_active_count ?? null,s.digital_listing_count ?? null,s.num_favorers || 0,s.review_average ?? null);
}
function saveReviews(rows,shopId) {
  const insert=db.prepare('INSERT OR IGNORE INTO reviews VALUES(?,?,?,?,?,?)');
  transaction(() => { for (const r of rows) if (r.transaction_id && r.listing_id) insert.run(r.transaction_id,r.shop_id || shopId,r.listing_id,r.create_timestamp || r.created_timestamp,r.rating ?? 5,String(r.review || '').slice(0,2000)); });
}
function budget() {
  const r=one('SELECT * FROM api_calls WHERE day=?',day()) || { used:0, remaining_reported:null,last_headers:'{}' };
  return { ...r, limit:5000, remaining:Math.max(0,Math.min(5000-r.used,r.remaining_reported ?? 5000)), headers:JSON.parse(r.last_headers || '{}') };
}
module.exports = { db, openDb, run, all, one, transaction, setting, setSetting, saveListing, saveShop, saveReviews, saveKeyword, budget };
