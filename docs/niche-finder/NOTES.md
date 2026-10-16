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
