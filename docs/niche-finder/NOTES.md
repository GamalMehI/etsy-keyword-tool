# Implementation notes

## Live verification, 2026-10-16

Re-ran `node scripts/api-probe.mjs` once: seven requests, all HTTP 200.
`x-limit-per-second=5`, `x-limit-per-day=5000`, and `x-remaining-today` are present.
Batch still supplies Shop and Images, including shop sales and lifetime review_count.
No differences were observed in the fields exercised by that probe. Collection later exposed a currency difference, detailed below. Search results and counts naturally change.

Historical browser research in docs/ is background only. This implementation follows the digital-only, official-API-only SPEC.md.

## Differences and explicit qualifications

- **Currency (new live finding):** a targeted batch call during bootstrap on 2026-10-16 requested `currency=USD` but returned a price with `currency_code=EUR`. USD is therefore not guaranteed by that parameter. Only confirmed USD prices are stored as `price_usd`; other prices/revenues are unavailable. Product/niche/report totals show priced coverage. We do not invent exchange rates. This affects revenue concentration and gross revenue completeness, but not review-based sales estimates.
- The API does not provide lifetime listing review counts in search/batch. Competition uses observed 90-day listing reviews and reports that qualification.
- A 90-day review backfill cannot establish the previous 90-day period. Its trend stays unavailable until 180 days of review coverage exist. Seven- and 30-day comparisons can use day-one history.
- Missing favorites/views signals have their allocation weights redistributed over observed signals. A shop with no evidence receives no invented equal split.
- Historical velocity uses all observed reviews as a lower-bound lifetime proxy while collection history is incomplete.
- Matching daily baselines are required for a full shop delta. Unknown/inaccessible reviewed listings keep confidence low.
- The original substring blocklist is preserved, including `stitch`; it conservatively blocks the supplied `cross stitch pattern` seed.
- The old Render public-deployment blueprint was removed because this Personal Access app is local-only.

## Acceptance evidence, 2026-10-16

- Live probe: seven requests, all HTTP 200. It was run once before implementation.
- Real bootstrap reached 48,808 active digital listings after the interactive validation (48,668 before it), 2,355 shops and 109,226 timestamped reviews. Zero non-download rows.
- Bootstrap stopped cleanly on the reserve: 4,164 local calls counted that day, 800 remaining. This includes resumed work after a transient network timeout. Incomplete review backfills remain resumable next day.
- Persisted dispatch logs: maximum 4 request starts in any rolling second. The earliest sequential bootstrap calls predated event logging; later concurrent calls are logged.
- A fresh “wedding planner template” report: 48 ranked products, 42 Etsy calls, 26.4 seconds, no partial-data warning, no Semrush key. The cached UI replay spent zero additional calls.
- Cold real-database products query: 505 ms at approximately 49k active products. End-to-end localhost HTTP measurement before keyword analysis was 488 ms.
- Automated suite: 16 node:test tests passed. The 20,000-listing/100,000-review cold benchmark was approximately 139 ms. Mock-only test was also rerun after making reviews respect listing creation dates.
- All four screens, filters/sorting, real product details/chart, and cached keyword replay checked in the browser at http://localhost:3456. No console errors. The live server is bound to 127.0.0.1:3456.
- After the 42-call interactive analysis, the persisted remaining budget was 758. These interactive calls are separate from the bootstrap threshold.

## Explorer acceptance, 2026-10-17
- Added a fifth screen without replacing the original four: DB-first products, opportunity-ranked sub-niches, arbitrary repeated `sub` path segments (up to 12 levels), breadcrumb navigation, existing product drawer, observed period reviews, explanations, quality gaps, filters and explicit enrichment.
- Opening, filtering and drilling make no Etsy Open API, Google or Semrush helper calls. API-supplied product images may load from Etsy’s image CDN. Google autocomplete and optional Semrush candidates come from the existing seven-day cache / saved reports; helpers refresh only through the clicked analyzer. No Semrush key is required.
- Product membership uses active downloads, the unchanged trademark substring blocklist, keyword links or whole title/tag phrases with singular/plural tolerance. Each child intersects its parent. Canonical word-order aliases retain merged membership in previews and drill-down. Generic formats and incomplete trailing “junk”/“digital” fragments are excluded. Thresholds are applied after canonical merging: at least 8 listings and 5 shops.
- The 80% overlap test uses **Jaccard** (intersection / union), preserving legitimate narrower children. The higher estimated-revenue name wins. Counts hidden by thresholds and eligible candidates beyond the top 30 are separate. Sub-niches overlap; co-occurring names such as “digital paper” below mean the subset **inside the selected parent**, not the entire Etsy market.
- Top-3 share covers all priced shops in each group; the existing scoreProducts scoring still uses its top-48 sample. Unknown total competition is explicitly labeled as a tracked-sample estimate. Unknown USD revenue stays unavailable. Monthly figures normalize the selected 7/30/90-day estimate to 30 days.
- Enrichment reuses analyze() and its single flight, daily report cache, 110-call cap and deadline. Explorer checks 110 calls above the configured reserve before fresh work and checks the reserve on every request/retry. Keyword analysis retains its original ability to use the interactive reserve. Low-budget tests refuse before helper/Etsy network activity.
- Startup builds shared text indexes for all three periods before listening. Dataset caching retains unchanged data and checks external SQLite changes at most every 30 seconds; explicit analysis/collection invalidation remains in place. The blocklist is compiled once with its original substring semantics.
- `node --test`: **29 passed**. Includes phrase extraction, generic/trademark removal, plurals/word order, overlap, thresholds, revenue concentration, why-wins text, all sort/filter modes, zero-network HTTP drill-down, consistent preview/detail totals, unescaped reviews, and protected reserve. Mock mode has 216 products, 30 days of snapshots and **6 planner sub-niches**; the enrichment click was exercised without Etsy calls.
- Real HTTP acceptance (first niche computation, shared index prepared at startup):
  - `junk journal`: **4,074** tracked English digital products; **30** eligible sub-niches returned; **479 ms** including JSON transfer.
  - `digital planner`: **1,848** tracked English digital products; **30** eligible sub-niches returned; **341 ms** including JSON transfer.
- Browser checks: original four screens, both Explorer shortcuts, three-level drill-down/breadcrumb return, product drawer, revenue/new-risers sorting and 7/30-day review labels. Desktop columns verified at 1440 px; mobile stacking verified at 390 px with no page overflow. No browser console errors. The real app remains running on 127.0.0.1:3456.
- API counter delta across both niche queries and their first three child drill-down checks: **0**. No live enrichment was triggered for these checks. Existing USD/review-history limitations still apply.

### Top 10 inside “junk journal” (30 days, English)

Ranked by opportunity, then estimated monthly USD revenue; all rows stay inside their parent niche.

| # | Sub-niche within parent | Listings | Shops | Opportunity /100 | Revenue/month USD, est. |
|---|---|---:|---:|---:|---:|
| 1 | journal kit | 1,641 | 67 | 55 | $29,846 est. |
| 2 | journal paper | 495 | 44 | 54 | $17,283 est. |
| 3 | paper craft | 1,052 | 45 | 54 | $10,502 est. |
| 4 | printable paper | 494 | 38 | 53 | $11,163 est. |
| 5 | journal page | 825 | 50 | 53 | $8,853 est. |
| 6 | junk journaling | 523 | 18 | 52 | $20,153 est. |
| 7 | digital junk journal | 344 | 22 | 52 | $12,829 est. |
| 8 | halloween printable | 69 | 24 | 52 | $559 est. |
| 9 | scrapbook paper | 446 | 45 | 51 | $9,491 est. |
| 10 | vintage halloween | 70 | 26 | 51 | $1,140 est. |

### Top 10 inside “digital planner” (30 days, English)

Ranked by opportunity, then estimated monthly USD revenue; all rows stay inside their parent niche.

| # | Sub-niche within parent | Listings | Shops | Opportunity /100 | Revenue/month USD, est. |
|---|---|---:|---:|---:|---:|
| 1 | 2027 planner | 154 | 62 | 65 | $12,457 est. |
| 2 | ipad planner | 649 | 143 | 64 | $33,184 est. |
| 3 | 2027 digital planner | 151 | 56 | 63 | $12,957 est. |
| 4 | weekly planner | 319 | 120 | 62 | $19,808 est. |
| 5 | adhd planner | 223 | 87 | 62 | $12,267 est. |
| 6 | daily planner | 359 | 132 | 60 | $20,663 est. |
| 7 | life planner | 202 | 103 | 60 | $12,462 est. |
| 8 | digital journal | 276 | 91 | 58 | $11,415 est. |
| 9 | monthly planner | 238 | 98 | 58 | $9,559 est. |
| 10 | 2026 2027 | 173 | 66 | 57 | $9,876 est. |
