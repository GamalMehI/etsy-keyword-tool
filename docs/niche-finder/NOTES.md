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
