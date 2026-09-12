# Etsy Niche Finder v2 — Semrush-first, browser-light

Why v2: the first version needed 180+ Etsy page loads in one sitting. Etsy's bot protection blocked it. This version does keyword discovery in Semrush (licensed data, no Etsy load) and uses the browser agent only to validate a short list at a human pace.

Before running anything on Etsy again: wait at least 24 hours after the block, do not retry until then, and run the browser agent in a window where you are NOT signed in to Etsy, so nothing gets tied to your account.

## Part 1: You, in Semrush (no browser agent)

Goal: a ranked list of 8 candidate phrases, 4 digital and 4 print-on-demand, each with real volume and trend.

### If you have the Ecommerce Keyword Analytics app

1. Retailer: Etsy. Country: US.
2. Run these roots one at a time and export all related keywords: planner, template, svg, png, printable, wall art, sweatshirt, shirt, mug, tote bag.
3. Merge exports into one sheet. Drop any row with a brand, character, celebrity, team, quote, or franchise.
4. Add columns:
   - conv = orders / search volume
   - trend = volume last month / volume 6 months ago
5. Keep rows where volume is 500 or more, conv is above the sheet median, and trend is 1.2 or more.
6. Sort by trend, then conv. Take the top 4 digital and top 4 POD.

### If you do not have the app

1. Organic Research, domain etsy.com, US. Filter URL contains /market/.
2. Filter keyword contains one of: digital, printable, svg, png, template, clipart, sweatshirt, shirt, mug, tote.
3. Export. Drop brand rows as above.
4. Keep rows with volume 500 or more and a position of 10 or better.
5. Open Keyword Overview on the top 30 and note the 12-month trend. Keep those rising or flat, drop those falling.
6. Sort by volume times a trend score. Take the top 4 digital and top 4 POD.

### Crossover pairing

For each POD phrase, check whether the theme plus "svg" also has volume. For each digital SVG or PNG phrase, check whether the theme plus "shirt" or "sweatshirt" has volume. Note pairs. They get priority in Part 2.

Hand the browser agent a list like this, 8 rows max:

| phrase | track | volume | trend | crossover partner |

## Part 2: Browser agent, paste below the line

---

Validate the phrases in the list I give you on etsy.com. Read only. Never sign in, favorite, buy, or message. Never use the JavaScript tool, never open more than one tab, never solve or work around any verification page.

Pace: after every page load, wait 25 to 45 seconds before the next action, scrolling the page slowly while you read it. Do at most 4 phrases per session. If Etsy shows any "access restricted", "unusual activity", or verification page, stop the whole session immediately, report which phrase you were on, and do not retry.

Set the Digital Downloads filter by hand once for the first digital phrase and reuse that URL pattern. POD phrases use no item filter.

For each phrase, load exactly these pages, in this order, and nothing more:

1. Search, sort relevancy. Record from the first 24 non-Ad listings: bestseller badges, listings with 100+ reviews, listings under 30 reviews, distinct shops, low and median price. POD only: count listings that look print-on-demand (mockup photos, made to order text, named blank like Bella Canvas or Gildan, 10+ color variants).
2. Search, sort most recent. Count how many of the first 24 newest listings already have 5 or more reviews.
3. Top listing by relevancy. Record review count, reviews dated in the last 30 days (count up to 30), price, "in X carts" if shown, shop total sales, shop age if visible. Read the 1 to 3 star reviews and note the recurring complaint in one sentence.
4. Second listing by relevancy. Same as step 3.
5. The shop page of the youngest-looking shop on page 1. Record age, total sales, listing count.

That is 5 page loads per phrase, about 20 per session. Take a full break between sessions.

Score each phrase:

- Demand velocity (0 to 5): reviews in the last 30 days across the 2 listings. 0 to 2 = 0, 3 to 7 = 1, 8 to 14 = 2, 15 to 29 = 3, 30 to 49 = 4, 50+ = 5.
- Open door (0 to 5): page-1 listings under 30 reviews or from shops under 12 months old. 0 = 0, 1 to 2 = 1, 3 to 4 = 2, 5 to 7 = 3, 8 to 11 = 4, 12+ = 5.
- Price room (0 to 3). Digital: 0 if median under 3 dollars, 1 under 6, 2 under 12, 3 at 12+. POD: margin = median price minus base cost minus shipping minus 10 percent of price, using t-shirt 11+5, sweatshirt 20+7, hoodie 23+7, mug 7+5, tote 9+5, poster 10+6. 0 if margin under 4, 1 under 8, 2 under 12, 3 at 12+.
- POD acceptance (POD only, gate): dead if fewer than 3 of the 24 page-1 listings are POD.
- Quality gap (0 to 2): 0 no consistent complaint, 1 one clear complaint, 2 same complaint on both listings.
- Crossover (0 to 2): 0 no partner, 1 partner given by me, 2 partner given and its top listing on Etsy also shows 100+ reviews (check only if I ask; otherwise score 1).

WINNER at 10 or more with demand velocity 2+ and open door 2+.

Output: a table with one row per phrase and every recorded field, the score breakdown, the winners marked, the main complaint to beat, and for crossover winners both halves of the first product: the digital file and the Printify product. Then a 4-line summary of which phrase to start with and why.
