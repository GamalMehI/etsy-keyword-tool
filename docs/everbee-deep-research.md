# Deep Niche Research with EverBee

EverBee has two halves. The web app (everbee.io) has Keyword Research, Shop Analyzer, Tag Analyzer and Trending. The Chrome extension adds a Product Analytics panel on top of any Etsy search or shop page with estimated sales per listing. The extension reads Etsy pages inside your browser, so: normal browser, home network, human pace, one search at a time, 30 to 60 seconds between searches, no more than about 60 searches a day. Never run it inside any automation.

EverBee's sales numbers are estimates from reviews, favorites and age. Treat them as ranks, not truth. A listing showing 400 sales a month is very likely selling more than one showing 40, but neither number is exact.

## The sheet

One row per keyword. Columns:

keyword | level | parent | track (digital or POD) | search volume | competition | keyword score | trend | p1 listings | p1 total monthly revenue | p1 listings with 30+ sales/mo | p1 listings under 12 months with 10+ sales/mo | top 3 shops revenue share | median price | median listing age | youngest strong shop (name, age, total sales) | main complaint | crossover partner | score | verdict

## Phase 1: Seeds and expansion (web app, Keyword Research)

1. Enter each root. Digital roots: planner, template, printable, svg, png, clipart, wall art, invitation, worksheet, notion template, canva template, goodnotes, procreate, sublimation. POD roots as theme plus product: nurse sweatshirt, teacher shirt, dog mom shirt, funny mug, retirement gift, bachelorette shirt, Christmas sweatshirt, halloween shirt, book lover tote, gym tank.
2. For each root, copy every related keyword the tool shows with its search volume, competition and keyword score into the sheet as level 2. Do not look up each one separately yet.
3. Also open Trending in the web app and add any digital or POD keyword rising in the last 30 days, marked source = trending.
4. Drop anything with a brand, character, celebrity, team, quote or franchise.
5. Sort by search volume divided by competition. Mark the top 40 as "screen".

Cap: 25 roots on day one.

## Phase 2: Screen on Etsy (extension, Product Analytics)

For each "screen" keyword, search it on Etsy with the extension panel open, sort Etsy by relevancy, and let the panel load the first page. Read from the panel:

- p1 listings: how many listings the panel analyzed, usually 48 or 64
- p1 total monthly revenue: the panel's sum for the page
- p1 listings with 30+ sales/mo (digital) or 15+ sales/mo (POD): count them
- p1 listings under 12 months old with 10+ sales/mo: count them, this is the open door
- top 3 shops revenue share: sort the panel by monthly revenue, add the top 3 shops' share of the page total
- median price and median listing age from the panel columns
- For POD only: how many page-1 listings look print-on-demand (mockup photos, made to order, Bella Canvas or Gildan named). Fewer than 6 means buyers here want handmade, skip.

Then sort the Etsy page by Most recent with the panel open and count how many of the newest 24 already show 5+ sales a month. Add that to the open door count.

Screen rules, apply in order:

- dead if fewer than 3 listings have 30+ sales/mo (15+ for POD). Nobody is buying at volume.
- dead if top 3 shops hold 60 percent or more of page revenue. Owned.
- dead if open door is 0 or 1. Locked.
- dig if 3 or more listings at volume AND open door 3 or more.
- expand if 8 or more listings at volume but open door under 3. Real demand, too broad, send back to Phase 1 with a modifier.
- otherwise screened.

Cap: 40 screens across days two and three. Stop for the day if Etsy shows any verification page.

## Phase 3: Dig (both halves)

For each dig keyword, put it back into Keyword Research, take its related keywords as level 3, screen the 5 best with the extension. Keep whichever is sharper: the child if it also scores dig, else the parent. Never go past level 4 or six words.

## Phase 4: Validate finalists (extension plus Shop Analyzer)

Cap 10 finalists. For each:

1. On the Etsy page with the panel, note the top 5 listings by monthly revenue: title, price, age, monthly sales, reviews, shop.
2. Open the youngest shop on page 1 that shows 10+ sales a month, then run it through Shop Analyzer: shop age, total sales, listing count, sales per listing, its top 5 listings. A shop under 12 months old with 500+ sales is the strongest signal that a newcomer can win here now, and its listing count tells you how many listings it took.
3. Run Tag Analyzer on the top 2 listings. Save their tags. These are your first tag set.
4. Read the 1 to 3 star reviews of the top 2 listings and write one sentence on the recurring complaint.
5. Crossover: for a digital SVG or PNG finalist, screen the theme plus "shirt" and "sweatshirt". For a POD finalist, screen the theme plus "svg" and "png". Note the partner if it has 3 or more listings at volume.

## Scoring, out of 17

- Demand (0 to 5): p1 listings with 30+ sales/mo (15+ for POD). 0 to 2 = 0, 3 to 4 = 1, 5 to 7 = 2, 8 to 11 = 3, 12 to 17 = 4, 18+ = 5.
- Open door (0 to 5): listings under 12 months with 10+ sales/mo, plus newest-24 hits. 0 to 1 = 0, 2 = 1, 3 to 4 = 2, 5 to 7 = 3, 8 to 11 = 4, 12+ = 5.
- Price room (0 to 3): digital median under 3 dollars = 0, under 6 = 1, under 12 = 2, 12+ = 3. POD: median minus base cost minus shipping minus 10 percent fees, under 4 = 0, under 8 = 1, under 12 = 2, 12+ = 3. Base costs: t-shirt 11 + 5, sweatshirt 20 + 7, hoodie 23 + 7, mug 7 + 5, tote 9 + 5, poster 10 + 6.
- Quality gap (0 to 2): no consistent complaint = 0, one clear complaint = 1, same complaint on both top listings = 2.
- Crossover (0 to 2): none = 0, partner with 3 to 5 listings at volume = 1, 6+ = 2.
- Concentration penalty: subtract 2 if top 3 shops hold 40 to 59 percent of page revenue.
- Seasonality penalty (POD): subtract 2 if occasion-bound and the window is more than 8 weeks away or passed.

WINNER at 10+ with demand 2+ and open door 2+. Near miss at 8 to 9.

## Output

1. Winners table, crossover winners first: keyword, track, score breakdown, page monthly revenue, median price, youngest strong shop, main complaint, first product to make (both halves for crossover).
2. Near misses with the single reason and, for seasonal ones, the date the window opens.
3. For the winner you start with: the tag set from Tag Analyzer, the shop you are modeling, and how many listings that shop needed.

## Daily budget

- Day 1: Phase 1 in the web app, no Etsy pages. 25 roots, 40 screens marked.
- Day 2: 20 screens with the extension, at human pace.
- Day 3: 20 screens plus digs.
- Day 4: validate 10 finalists, Shop Analyzer, Tag Analyzer.
- Day 5: crossover checks, scoring, decide.
