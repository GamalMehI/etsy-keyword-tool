# Etsy Keyword Tool

Type a keyword, get demand, trend, difficulty, Etsy competition, price stats and sub keywords. Zero dependencies, Node 18+.

## Run

```
cp .env.example .env   # add your keys
node server.js         # open http://localhost:3456
```

## Two modes

**Keyword** tab: one keyword in, metrics plus sub keywords out. Click "Dig" on any sub keyword to recurse.

**Niche finder** tab: one root keyword in. The tool expands it into sub keywords (Google autocomplete plus Semrush related keywords if you have a key), drops trademark-risk phrases, then for each phrase pulls the top 100 Etsy listings, checks the shops behind the first 24, and counts reviews from the last 30 days on the top listings. Each phrase is scored out of 17:

| part | what it measures | source |
|---|---|---|
| demand velocity (0-5) | reviews in the last 30 days on the top listings | Etsy reviews API with min_created |
| open door (0-5) | page-1 shops under a year old or under 500 sales | Etsy shops API |
| price room (0-3) | median price of the top 100 | Etsy listings API |
| quality gap (0-2) | share of 1-3 star reviews in the last 90 days on the top 2 | Etsy reviews API |
| Google volume bonus (0-2) | monthly Google searches | Semrush |

WINNER needs 10 or more with demand 2+ and open door 2+. Every niche row expands to its products with estimated monthly sales (reviews x 10) and the low-star review snippets, and a cross-niche "winning products" table ranks listings by estimated revenue.

A run of 12 sub keywords is roughly 400 Etsy API calls, about 2 minutes, well under the 10,000 per day limit. Everything is cached for 7 days.

Set `ETSY_MOCK=1` in .env to try the UI with fake data before you have a key.

## Data sources

| metric | source | key needed |
|---|---|---|
| Google volume, 12-month trend, KD, related keywords | Semrush Analytics API | SEMRUSH_API_KEY (Business plan, API units) |
| Etsy competition, prices, listing ages, digital share, shop sales and ages | Etsy Open API v3 | ETSY_API_KEY (register an app at etsy.com/developers) |
| Sub keyword suggestions | Google autocomplete | none |

Without keys the tool still returns sub keywords from Google autocomplete. Clicks and CTR like eRank shows come from eRank's private dataset and are not available anywhere public, so they are not shown.

The tool never loads etsy.com web pages, only the official API, so it does not trigger Etsy's bot protection.

## Scores

- Etsy difficulty (0 to 100): 60 percent from log of total competing listings, 40 percent from incumbency (share of top-100 shops that are under a year old or under 500 sales, inverted).
- Opportunity (0 to 100): Google demand on a log scale minus 0.6 x difficulty, plus 20. Strong at 65+, possible at 45+.

Results are cached in cache.json for 7 days to save API units.

## Deploy free on Render

1. Push this repo to GitHub.
2. At render.com choose New, Blueprint, pick the repo. The included render.yaml creates a free web service.
3. Fill in ETSY_API_KEY, SEMRUSH_API_KEY (optional) and APP_PASSWORD when asked.
4. You get a free https URL like https://etsy-keyword-tool.onrender.com. Free services sleep after 15 minutes idle and take about 30 seconds to wake.

Always set APP_PASSWORD on a public URL. Without it anyone who finds the link can spend your API quota.
