# Etsy Digital Niche Finder — Spec

Local web app (runs on localhost only) that helps one seller pick the niche for a **digital-products** Etsy shop. It answers three questions:

1. **Hot products**: which digital listings are selling the most right now, over the last 7, 30 or 90 days, with an estimated monthly sales and revenue figure for each product (like EverBee's Product Analytics).
2. **Keyword analyzer**: for a keyword or niche, how strong is demand, how hard is the competition, and is the door open for a new shop.
3. **Niches**: which families of digital products are growing, ranked by opportunity.

Digital only. A listing is kept only when `listing_type === "download"`. Listings with `physical` or `both` are never stored.

Visual reference: `docs/niche-finder/mockups.html` (open it in a browser). The UI language is French.

---

## 1. Hard constraints

- **Official Etsy Open API v3 only.** Never fetch etsy.com HTML pages, never scrape, never automate a browser on Etsy. The user's IP was already blocked once by Etsy's bot protection and a new shop will be linked to this account.
- **Auth header.** Every request sends `x-api-key: ${ETSY_API_KEY}:${ETSY_SHARED_SECRET}`. The current `server.js` sends only the keystring, which now returns `403 Shared secret is required in x-api-key header.` Fix this first.
- **Rate limits (Personal Access app).** 5 requests per second and 5,000 requests per day. Run at most 4 requests per second. Read the rate-limit response headers on every call (`scripts/api-probe.mjs` logs their exact names; expect something like `x-limit-per-day` and `x-remaining-today`), store them, and stop all background work when the remaining daily budget reaches the interactive reserve (default 800). On `429`, back off exponentially and retry up to 3 times.
- **Personal Access means local use only.** Do not deploy publicly. Keep `APP_PASSWORD` support, but the default is localhost.
- **Every estimate is labeled as an estimate** and carries a confidence level. Never present an estimate as a real sales figure.
- **Zero runtime dependencies**, as in the current repo. Node 24 is installed. Use the built-in `node:sqlite` for storage and `node:test` for tests.
- Keep the existing trademark blocklist and apply it to every keyword and listing title.

---

## 2. What the Etsy API gives us (and what it does not)

Endpoints used (all work with the API key alone, no OAuth):

| Endpoint | Use | Cost |
|---|---|---|
| `GET /listings/active?keywords=&sort_on=score&limit=100&offset=` | Keyword search. Returns `count` (total competing listings) and up to 100 listings. | 1 call per 100 results |
| `GET /listings/batch?listing_ids=…&includes=Shop,Images` | Refresh up to 100 listings in one call: `num_favorers`, `views`, price, image, **and the full Shop object** (`transaction_sold_count`, `create_date`, `digital_listing_count`, `listing_active_count`). | 1 call per 100 listings |
| `GET /shops/{id}/reviews?min_created=&limit=100` | All new reviews of a shop since a timestamp. Each review carries `listing_id`, `rating`, `create_timestamp`. The `count` field is the total for the filter. | 1 call per 100 reviews |
| `GET /listings/{id}/reviews?min_created=` | Reviews for one listing. Used only by the keyword analyzer for listings not yet tracked. | 1 call per listing |
| `GET /shops/{id}/listings/active?limit=100` | All active listings of a shop, to discover a strong shop's other digital products. | 1 call per 100 listings |
| `GET /shops/{id}` | Shop details when not available through batch. | 1 call |
| `GET /buyer-taxonomy/nodes` | Category tree, fetched once and cached. | 1 call |

Not available, by design of the API:

- **No per-listing sales count.** Etsy does not expose sales per product. We estimate them (section 4).
- **No trending or best-seller endpoint.** We build the ranking ourselves from daily snapshots.
- **No history.** The API returns current values only. The collector stores one snapshot per day so the app can compute changes. Reviews are the exception: they are timestamped, so 90 days of review history are available on day one.
- **No `listing_type` filter on search.** We filter digital listings after each search and record each keyword's digital share. Keywords under 50 percent digital are dropped from discovery.
- **`sort_on` accepts only** `created`, `price`, `updated`, `score`. No sort by sales or favorites.
- Etsy autocomplete, search volume on Etsy, clicks and CTR are not in the API. Google volume and trend come from Semrush (already integrated), sub-keywords from Google autocomplete (already integrated).

### Verified live on 2026-10-16 with the user's key

`scripts/api-probe.mjs` plus two follow-up probes (25 calls total) confirmed:

- **Auth**: `x-api-key: keystring:shared_secret` works. The keystring alone returns 403.
- **Rate-limit headers** on every response: `x-limit-per-second: 5`, `x-remaining-this-second`, `x-limit-per-day: 5000`, `x-remaining-today`. Use `x-remaining-today` as the source of truth for the daily budget.
- **`sort_on=score` is NOT Etsy's website ranking.** For "wedding planner template", the first 10 results had 0, 0, 1, 39, 19, 0, 7024, 0, 26, 0 favorites, and the three best-selling listings sat at positions 6, 85 and 171. So the API's first 48 results are not "page 1 of Etsy". Never treat API search order as a ranking. Pull a deeper pool and rank by our own metrics (section 6).
- **Pagination stops around offset 10,000.** `offset=9900` works, `offset=12000` returned 400 even though `count` was 46,201. Each keyword exposes at most about 10,000 listings.
- **`views` and `num_favorers` ARE present in search results** (289 of 300 had views). Discovery can pre-rank candidates without any extra call.
- **Batch with `includes=Shop`** returns the full shop object, including `transaction_sold_count`, `digital_listing_count`, `listing_active_count`, `create_date`, `review_count`, `review_average`.
- **Shop `review_count` is the lifetime total** in practice, even though the docs say "past year": it equals the reviews endpoint `count` (11,249 = 11,249; 8,268 = 8,268), and that shop had 7,000+ reviews older than 400 days. So `K = transaction_sold_count / review_count` is available on day one from the batch call, at no extra cost.
- **Real K values** on three large digital shops: 15.8, 11.7 and 11.2 sales per review. The default K of 12 is right.
- **Reviews carry** `shop_id, listing_id, transaction_id, buyer_user_id, rating, review, language, image_url_fullxfull, create_timestamp`. Never store `buyer_user_id`. Review text is HTML-escaped (`&#39;`).
- **`max_created` alone returns odd counts** (the same 7,429 for two different shops). Always pair it with `min_created`.
- **Language**: about 94 percent of results were `en-US`; the rest were de, nl, es, fr. Store `language` and default the UI to English listings.
- **Keywords with "template" or "printable" return almost only digital listings** (100 of 100 here), so the digital share filter mainly matters for generic seeds.
- Scale check: the top digital shop in this niche had 177,415 sales and 119 reviews in the last 30 days spread over 35 listings, about 1,900 estimated sales a month.

Full raw output: `docs/niche-finder/api-probe-result.json`.

---

## 3. Architecture

```
server.js                 HTTP server (keep), routes moved to src/routes.js
src/etsy.js               API client: auth header, 4 req/s token bucket, daily budget, retries, call log
src/db.js                 node:sqlite schema + queries
src/discovery.js          finds digital listings to track (seeds, taxonomy, shop expansion)
src/collector.js          daily job: refresh listings + shops, pull new reviews, discovery
src/estimate.js           sales and revenue estimates per listing and period (pure functions)
src/score.js              keyword and niche scores (pure functions)
src/keyword.js            on-demand keyword analysis (reuses DB data before spending calls)
src/semrush.js, src/google.js   moved from server.js unchanged
config/seeds.txt          seed keywords, one per line (editable from the UI)
public/                   vanilla JS single-page UI, 4 screens
scripts/collect.mjs       `npm run collect` — runs the daily job once (for launchd/cron)
scripts/api-probe.mjs     live API probe
test/                     node:test unit tests for estimate.js and score.js
```

The server also schedules the daily job itself at `COLLECT_HOUR` (default 6) when it is running. Provide `scripts/com.etsy-niche-finder.collect.plist` as a macOS launchd example so collection runs daily even when the UI is closed.

### Database (SQLite, file `data/niche.db`, gitignored)

```
listings(listing_id PK, shop_id, title, url, image_url, price_usd, taxonomy_id, tags JSON, language,
         created_ts, first_seen, last_seen, active INTEGER, discovered_via TEXT)
listing_snapshots(listing_id, day TEXT, num_favorers, views, price_usd, PRIMARY KEY(listing_id, day))
shops(shop_id PK, shop_name, url, icon_url, created_ts, first_seen, last_seen, last_review_ts)
shop_snapshots(shop_id, day, transaction_sold_count, review_count, listing_active_count,
               digital_listing_count, num_favorers, review_average, PRIMARY KEY(shop_id, day))
reviews(transaction_id PK, shop_id, listing_id, created_ts, rating, text)   -- never store buyer_user_id
keywords(keyword PK, source, digital_share, total_count, first_seen, last_searched, active)
listing_keywords(listing_id, keyword, best_rank, PRIMARY KEY(listing_id, keyword))
estimates(listing_id, day, period INTEGER, sales, revenue, method, confidence,
          PRIMARY KEY(listing_id, day, period))
keyword_reports(keyword, day, report JSON, PRIMARY KEY(keyword, day))
api_calls(day PK, used, remaining_reported, last_headers JSON)
```

Prices are requested with `currency=USD` so every price is comparable.

---

## 4. Sales estimate per product

All functions in `src/estimate.js` are pure and unit-tested.

### 4.1 Review-based estimate (available on day one)

```
sales_P(listing) = reviews_in_last_P_days(listing) × K(shop)
```

`K(shop)` is the sales-per-review ratio of the shop, calibrated on the shop's own lifetime numbers. Both come in the Shop object of the batch call, so K is free on day one (verified: shop `review_count` is the lifetime total):

```
K(shop) = transaction_sold_count / review_count
K(shop) is clamped to [4, 60]
If review_count < 20, use the global median K of all tracked shops (default 12 until there are 30 shops;
live probe measured 11.2, 11.7 and 15.8 on large digital shops)
Once 30 days of shop snapshots exist, prefer the recent ratio:
K_recent = Δ transaction_sold_count / Δ review_count over the last 30 days (if Δ review_count ≥ 10)
```

### 4.2 Shop-delta estimate (after 7 days of snapshots)

`transaction_sold_count` is the exact total of shop sales. Its change between two daily snapshots is the shop's real sales for that window. Split it across the shop's listings:

```
shop_sales_W        = transaction_sold_count(today) − transaction_sold_count(today − W)
weight(listing)     = 0.60 × share of the shop's reviews in the last 90 days that belong to this listing
                    + 0.25 × share of the shop's favorites gained in window W
                    + 0.15 × share of the shop's views gained in window W
digital_factor      = share of the shop's 90-day reviews that belong to digital listings
                      (fetch unknown reviewed listing_ids through the batch endpoint to learn their type)
sales_W(listing)    = shop_sales_W × digital_factor × weight(listing)
```

If the shop has a single active digital listing and `digital_listing_count == listing_active_count`, the listing gets all the shop's sales.

### 4.3 Final number

```
if shop-delta data covers the period:  sales = 0.7 × shop_delta + 0.3 × review_based
else:                                   sales = review_based
revenue = sales × price_usd
```

Periods: 7, 30, 90 days. The 90-day figure uses the review method until 90 days of snapshots exist. All periods are normalized to a monthly figure for the "ventes/mois" column (`sales_P × 30 / P`).

### 4.4 Confidence

- **Haute**: shop-delta available for the full period, and either the shop has 20 digital listings or fewer, or this listing holds 40 percent or more of the shop's 90-day reviews.
- **Moyenne**: shop-delta available for at least 7 days, or 10 or more reviews in the period.
- **Basse**: everything else.

### 4.5 Ranking metrics

- `trend` = sales of the period / sales of the previous period of the same length (reviews make the previous period available immediately). Shown as +x %.
- `velocity` = estimated lifetime sales / listing age in days. Finds young listings that sell fast.
- **Viral** badge: listing younger than 90 days and estimated 20+ sales per month.
- **Classique** badge: older than 2 years and still 30+ sales per month.

---

## 5. Discovery and daily collection

### 5.1 Discovery (which listings we track)

1. **Seed keywords** from `config/seeds.txt`. Start with: digital planner, printable planner, budget spreadsheet, notion template, canva template, goodnotes planner, wedding planner printable, wedding invitation template, baby shower games printable, kids chore chart, homeschool worksheets, teacher printables, resume template, social media templates, lightroom presets, procreate brushes, digital paper, clipart bundle, svg bundle, sublimation design, printable wall art, coloring pages printable, crochet pattern, knitting pattern, cross stitch pattern, sewing pattern pdf, small business templates, bookkeeping spreadsheet, meal planner printable, journal prompts printable.
2. **Expansion**: each seed is expanded with Google autocomplete and Semrush related keywords (existing code). New keywords go into `keywords` with `source = expansion`.
3. **Search**: for each active keyword, search `sort_on=score` (offsets 0 to 400, 5 calls) and `sort_on=created` (offset 0, to catch new listings). Keep `listing_type === "download"`. Search results already include `num_favorers` and `views`, so pre-rank candidates without extra calls and start tracking only listings with 20+ favorites, or 500+ views, or younger than 90 days with 5+ favorites. API search order is not Etsy's website ranking (verified), so `best_rank` is informative only. Record `count`, digital share and each listing's position in `listing_keywords`. Pagination stops near offset 10,000.
4. **Shop expansion**: any shop whose estimated monthly digital sales exceed 100 gets its active listings pulled once a week, digital ones added.

### 5.2 Daily job, budget of 5,000 calls

Priority order, each step stops when its budget is spent:

| Step | Calls | Notes |
|---|---|---|
| A. Refresh tracked listings through batch with `includes=Shop,Images` | about 200 for 20,000 listings | Writes `listing_snapshots` and `shop_snapshots` in the same pass |
| B. New reviews per shop since `last_review_ts` | about 1,500 to 2,000 | Shops ordered by estimated sales, highest first |
| C. Discovery searches and shop expansion | up to 1,000 | Rotates through keywords, oldest `last_searched` first |
| D. New shops: 90-day review backfill | rest | K already comes from the batch call; this gives new shops a review history right away |
| Reserve for interactive keyword analysis | 800 | Never used by the background job |

Then recompute `estimates` for all listings for periods 7, 30, 90.

Day-one bootstrap (`npm run collect -- --bootstrap`): seeds, expansion, searches, then batch details (which bring K) and 90-day shop reviews for the first 3,000 digital listings, highest favorites first. It may take two days of budget. Show progress in the UI.

---

## 6. Keyword analyzer

On demand, cached per keyword per day. Uses tracked data first and spends calls only for what is missing (typical cost 60 to 90 calls).

API search order is not Etsy's page 1 (verified: best sellers sat at positions 6, 85 and 171), so the analyzer builds its own "top 48":

1. Search `sort_on=score`, offsets 0 to 400 (5 calls, 500 listings). Keep digital listings. `total_count` = response `count`.
2. Pre-rank the pool by `num_favorers` and `views` (both present in search results). Take the best 150.
3. Batch details for those 150 with `includes=Shop` (2 calls). This gives each shop's K.
4. 30-day reviews for the best 60 by pre-rank (from the DB when fresh, else the listing reviews endpoint).
5. Estimate monthly sales for those 60, then **"top 48" = the 48 with the highest estimated sales**. Every score below uses this set.
6. Semrush overview (Google volume, 12-month trend, KD) and related keywords. Google autocomplete for sub-keywords.

Scores, 0 to 100 (`src/score.js`, unit-tested):

```
demand      = 50% log-scaled sum of estimated monthly sales of the top 48 digital listings
                (0 at 50 sales, 100 at 20,000)
            + 30% number of top-48 listings with 30+ estimated sales per month (0 at 0, 100 at 18+)
            + 20% Google monthly volume log-scaled (0 at 100, 100 at 100,000); without Semrush,
                  redistribute this 20% over the two others
competition = 35% log of total_count (0 at 1,000, 100 at 500,000)
            + 25% top-3 shops' share of page revenue (0 at 20%, 100 at 70%)
            + 20% share of the top 48 coming from shops with 5,000+ sales
            + 20% median review count of the top 24 (0 at 20, 100 at 2,000)
open_door   = count of top-48 listings younger than 12 months with 10+ estimated sales per month,
              plus top-48 shops younger than 1 year (0 at 0, 100 at 12+)
opportunity = demand × (1 − competition/100) × 0.8 + open_door × 0.2
verdict     = "Foncer" if opportunity ≥ 50 and demand ≥ 40 and open_door ≥ 25
              "À creuser" if opportunity ≥ 35
              "Éviter" otherwise
```

Also return: median price and price range, median listing age, digital share, top listings table (same columns as Hot products), sub-keywords each with an Analyze button, and up to 5 snippets of 1 to 3 star reviews from the top 2 listings (quality gap).

---

## 7. Niches

A niche is a keyword in `keywords` (seed or expansion). A listing belongs to every keyword it ranked for. Niche metrics are computed from the DB only, no API calls:

- tracked digital listings, number of shops
- estimated revenue for the period and trend versus the previous period
- median price
- top-3 shops' share of revenue
- new-listing success rate: share of listings younger than 90 days with 5+ estimated sales per month
- the same demand, competition, open door and opportunity scores as the keyword analyzer
- Google volume and trend from the last Semrush lookup, if any

---

## 8. UI (see mockups)

Four screens in a left navigation, French labels:

1. **Produits tendance** (default): period switch 7j / 30j / 90j; filters for niche, price range, listing age (under 30 days, under 90 days, under 1 year, all), minimum confidence, text search; sortable table: image, title, shop, price, ventes/mois est., revenu/mois est., tendance, favoris, âge, confiance, badges (Viral, Classique). Clicking a row opens a side panel: larger image, link to Etsy, daily estimated sales chart over the period (reviews per day × K, and favorites as a line), shop stats (age, total sales, digital listings), tags with an Analyze button each.
2. **Analyse de mot-clé**: input with autocomplete from tracked keywords; four score cards (Demande, Concurrence, Porte ouverte, Opportunité) with verdict; Google volume and 12-month trend sparkline; key stats row; top digital listings table; sub-keywords list with Analyze buttons; quality gap snippets.
3. **Niches**: ranked table with revenue sparkline, trend, scores, verdict; clicking opens Produits tendance filtered to that niche.
4. **Collecte**: today's API calls used out of 5,000 with the reserve marked; last run time and outcome; tracked listings, shops, reviews; days of history and estimate maturity ("estimations fiables à partir du jour 7"); Run now button; seeds editor.

A banner shows "Données d'exemple" in mock mode, and a small "est." label sits next to every estimated number.

---

## 9. Acceptance criteria

- `node scripts/api-probe.mjs` succeeds with the user's key and secret.
- `npm run collect -- --bootstrap` fills the DB with at least 2,000 digital listings without exceeding 4,200 calls, and never exceeds 4 requests per second.
- No row in `listings` has a `listing_type` other than `download`.
- Hot products screen loads in under 1 second from the DB with 20,000 listings.
- Keyword analysis of a fresh keyword costs under 120 calls and completes in under 90 seconds.
- `ETSY_MOCK=1` produces a full working UI with plausible fake data and 30 days of fake snapshots.
- `node --test` passes, with tests covering K calibration and clamping, shop-delta allocation, confidence levels, and every score function at its edges.
- No request ever goes to an etsy.com web page.
