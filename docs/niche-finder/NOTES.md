# Implementation notes

## Live verification, 2026-10-16

Re-ran `node scripts/api-probe.mjs` once: seven requests, all HTTP 200.
`x-limit-per-second=5`, `x-limit-per-day=5000`, and `x-remaining-today` are present.
Batch still supplies Shop and Images, including shop sales and lifetime review_count.
No API contract differences from the spec were observed. Search results and counts naturally change.

Historical browser research in docs/ is background only. This implementation follows the digital-only, official-API-only SPEC.md.
