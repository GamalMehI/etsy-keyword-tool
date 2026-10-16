const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
let env = {};
try {
  env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').flatMap(line => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    return m ? [[m[1], m[2].replace(/^(["'])(.*)\1$/, '$2')]] : [];
  }));
} catch {}
const get = (k, fallback = '') => process.env[k] ?? env[k] ?? fallback;
const MOCK = get('ETSY_MOCK') === '1';
module.exports = {
  ROOT, MOCK, ETSY_KEY: get('ETSY_API_KEY'), ETSY_SECRET: get('ETSY_SHARED_SECRET'),
  SEMRUSH_KEY: get('SEMRUSH_API_KEY'), SEMRUSH_DB: get('SEMRUSH_DB', 'us'),
  APP_PASSWORD: get('APP_PASSWORD'), PORT: Number(get('PORT', 3456)),
  DB_PATH: get('DB_PATH', path.join(ROOT, 'data', MOCK ? 'mock.db' : 'niche.db')),
  RESERVE: Math.max(800, Math.min(4999, Number(get('INTERACTIVE_RESERVE', 800)) || 800)),
  COLLECT_HOUR: Math.max(0, Math.min(23, Number(get('COLLECT_HOUR', 6)) || 0)),
};
