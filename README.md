# Etsy Digital Niche Finder

A local French dashboard for researching **digital downloads** with Etsy Open API v3. Built on the existing keyword tool, with no runtime dependencies. Requires **Node 24+** (`node:sqlite`). No Etsy web pages are fetched or automated.

## Setup

```sh
node --version                  # 24 or newer
cp .env.example .env            # only if you do not already have .env
# Edit .env privately: ETSY_API_KEY and ETSY_SHARED_SECRET are both required.
npm run collect -- --bootstrap
npm start
```

Open [the local dashboard](http://localhost:3456). The server binds to `127.0.0.1`. This Personal Access application is for local use; do not deploy it publicly. `APP_PASSWORD` retains HTTP Basic authentication (any username). Do not put credentials into a URL, source code, screenshot, or Git commit.

`.env`, `data/` (SQLite, cache, logs), and the legacy `cache.json` are gitignored. Never commit them. There is no install step. The supplied live probe was rerun successfully on 2026-10-16; future verification uses `node scripts/api-probe.mjs` (about seven calls, now accounted for by the shared client).

## Screens

- **Produits tendance**: 7/30/90-day estimates normalized to sales and gross revenue per month; niche, USD price, age, confidence, language and text filters; sortable columns and pagination. English listings are shown by default. Product details show observed daily reviews × K, observed favorites, shop totals, and tags that open keyword analysis.
- **Analyse de mot-clé**: a pool of up to 500 search results, pre-ranked by favorites and views; up to 150 detailed products, reviews for the best 60, then our top 48 by estimated sales. Four scores and a verdict, pricing, digital share, suggestions, optional Google volume and low-star reviews. This is our ranking of an API sample, not Etsy’s first page.
- **Niches**: database-only rankings and weekly review-based revenue sparklines. Click a niche to filter its products. Products can belong to multiple niches, so niche revenues overlap.
- **Collecte**: persisted API usage and remaining budget, protected interactive reserve, collection progress/outcome, history maturity, editable seeds and schedule.

All estimated sales, revenue, growth, concentration and success figures are labeled `est.`. Confidence describes evidence coverage, not statistical certainty. Shop lifetime sales, favorites and prices are observed API values.

## Daily collection

```sh
npm run collect                 # one daily refresh
npm run collect -- --bootstrap # build/resume the initial pool
```

Bootstrap expands seeds using the existing Google autocomplete and optional Semrush helpers, searches deeper API pools, selects candidates with favorites/views signals, refreshes the first 3,000 by favorites, and backfills new shops’ 90-day reviews. Only `listing_type === "download"` enters `listings`; physical and `both` never enter it. Shop review discovery may add more digital listings. A partial bootstrap is useful immediately and can need a second day’s budget for complete reviews.

Normal collection refreshes tracked listings and shops together with batch calls; collects new reviews from established shops; rotates discovery through least-recently searched keywords (up to roughly 1,000 calls); expands shops with over 100 estimated monthly digital sales weekly; then backfills new shops. Low digital-share keywords are disabled. Seeds are in `config/seeds.txt` and editable in the UI. The original trademark substring blocklist applies to every keyword and listing title. As a conservative consequence, the supplied `cross stitch pattern` seed matches `stitch` and is skipped. Saving seeds reports and removes blocked phrases.

The client uses **key:shared-secret** authentication, USD request parameters, a persisted 260 ms gate (at most four starts per second), and a shared SQLite daily counter. It honors Etsy’s `x-remaining-today` as well as the app’s 5,000-call ceiling. Background work stops with **800 calls remaining**; interactive requests may use this reserve. The gate and job lock coordinate the server and CLI. Each retry counts; HTTP 429, server errors and transient network failures back off with at most three retries. Endpoint/status/timing logs contain no credentials or query text and are retained locally for 30 days. Reported quota may include calls made outside this app. API budget days use UTC; the UI schedule uses **Africa/Casablanca**.

Review inserts are idempotent by transaction ID. Buyer IDs are discarded. A frozen `min_created`/`max_created` window and persisted backfill cursor allow safe continuation. Unknown reviewed listings are classified through batch calls; only their type is stored when physical/unavailable. Interrupted processes are detected on the next collection. A concurrent second collector returns `already_running`.

The running server checks every 30 seconds for the daily collection time (`COLLECT_HOUR`, default 06:00). You can change it in Collecte. It catches up after that hour when open and avoids repeating a job already started that day. It cannot wake a closed app or sleeping Mac.

For collection while the UI is closed, edit `scripts/com.etsy-niche-finder.collect.plist` with your absolute Node 24 path (`command -v node`) and project path, create `data/`, then install the edited file:

```sh
mkdir -p data ~/Library/LaunchAgents
cp scripts/com.etsy-niche-finder.collect.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.etsy-niche-finder.collect.plist
```

The plist uses the Mac’s local clock. Match that clock to Casablanca or adjust its Hour. The UI schedule does not rewrite launchd’s schedule. To unload: `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.etsy-niche-finder.collect.plist`.

## How estimates work

Etsy exposes shop sales totals, **not sales per product**. Our figures are estimates of gross demand, comparable in intent to EverBee, with a public formula rather than a claim to exact transactions.

1. **Day one:** listing reviews in the selected period × shop K. K is lifetime shop sales / lifetime shop reviews, clamped to 4–60. Shops with fewer than 20 reviews use the tracked-shop median (default 12 until 30 shops). Once an exact 30-day baseline exists, a recent ratio is preferred if at least 10 reviews were gained.
2. **With a full matching snapshot window:** 70% shop-sales-delta allocation + 30% review-based estimate. Allocation uses the listing’s share of digital reviews (60%), gained favorites (25%), and gained views (15%). The shop’s digital review share adjusts mixed shops. If a signal is absent its weight is redistributed among observed signals. No signals means no allocation; we do not invent an equal share. A shop with exactly one active digital listing and no physical listings allocates its entire sales delta to that listing.
3. **Revenue:** estimated sales × current comparable USD price. Unknown/non-USD prices remain unavailable rather than being relabeled USD. A live batch check confirmed that Etsy can return EUR despite `currency=USD`; aggregates show their USD-price coverage and omit unavailable revenue. Revenue is before fees, tax, discounts, refunds, bundles and price changes.

Snapshots are daily observations, not transaction history. We require matching baseline dates, rather than treating a gap as an exact period. Partial 7+ day history can improve confidence but is never extrapolated into a full 30/90-day delta. Zero reviews can coexist with real sales. Incomplete review coverage stays low confidence. Unknown/unavailable reviewed listings conservatively reduce digital allocation.

Confidence is **Haute** with a full delta window and a shop of at most 20 digital listings or a listing holding at least 40% of its tracked digital reviews; **Moyenne** with 7+ days of snapshots or 10+ reviews in the period; otherwise **Basse**. Incomplete review coverage overrides these to Basse. These are evidence labels, not error bounds.

A 90-day backfill supports 7- and 30-day prior-period comparisons on day one. A 90-day trend needs **180 days** of review coverage, so it is unavailable initially. No invented percentage replaces missing history or a zero comparison denominator. Daily charts are the review proxy; their bars need not sum to a blended total. Velocity uses all observed listing reviews × K / listing age, a lower-bound lifetime proxy while history is incomplete. Badges: Viral = younger than 90 days with 20+ estimated sales/month; Classique = older than two years with 30+ estimated sales/month.

Demand, competition, open-door and opportunity use the formulas in `docs/niche-finder/SPEC.md`. Without Semrush, the Google-volume weight is redistributed over the Etsy sales and successful-listing signals. Etsy does not expose lifetime review totals per listing, so the review-count competition component uses **observed 90-day listing reviews** (explicitly labeled in keyword reports). This can understate incumbency in partially collected markets. Scores and verdicts should be used to compare the observed sample, not as a promise of success.

## Optional sources and cache

Semrush (`SEMRUSH_API_KEY`, optional, `SEMRUSH_DB=us`) supplies Google volume, a 12-month trend and related terms. With no key it returns null/empty results and the UI explains the absence. Google autocomplete needs no key and falls back to an empty list on failure. Their existing formats and seven-day JSON cache are preserved in `data/cache.json` (the old root cache is imported when present). Etsy snapshots are refreshed daily; keyword reports are cached per day. Missing review coverage triggers bounded API work, while fresh tracked data is reused.

Fresh keyword analyses have a **110-call maximum** (including retries) and a 79-second Etsy deadline. Optional helpers time out after six seconds. Heavy review pagination or an exhausted reserve yields an explicitly partial report; missing data is never silently turned into high confidence. Only one fresh interactive analysis runs per server at a time.

## Mock mode and verification

```sh
ETSY_MOCK=1 npm start             # same UI, separate data/mock.db; no Etsy or helper calls
ETSY_MOCK=1 npm run collect
npm test                         # node:test, no external requests
```

Mock mode seeds deterministic digital products, shops, timestamped reviews and 31 daily observations spanning 30 days. Its banner clearly says **Données d’exemple**. The live database is never seeded with fake records.

Tests cover calibration/clamping, digital allocation, period normalization, blend/confidence boundaries, every score function’s endpoints, digital-only storage, discarded buyer IDs, concurrency/rate spacing, quota persistence/reserve, 429 retries, local HTTP routes and origin protection. A cold query with 20,000 listings and 100,000 reviews is checked against the one-second requirement. See `docs/niche-finder/NOTES.md` for live acceptance evidence and implementation qualifications.
