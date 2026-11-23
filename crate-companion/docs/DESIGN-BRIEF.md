# Crate Companion: design brief

A brief for designing the interface of Crate Companion. It describes what the app does,
who it's for, the data each screen has to show, the constraints, and the visual direction
chosen so far. Paste it whole into a design tool, then add one of the requests from
[What to ask for](#what-to-ask-for) at the end.

---

## In one paragraph

Crate Companion is a companion app for vinyl record collectors, built on the Discogs API
(Discogs is the big online database and marketplace for records). It shows your record
collection and wantlist, finds records from your wantlist for sale in the shops you trust,
judged by condition, seller reputation and price, and recommends records you don't own yet
based on what you collect. It's a web app today and will ship as an **Android and iOS app**,
so phone screens are the priority.

## Who it's for

- **The user:** a serious hobby collector with a few hundred records, mostly 1970s hard
  rock and classic rock (Rolling Stones, Led Zeppelin, Black Sabbath, Genesis, AC/DC,
  Foghat). Knows grading terms (NM, VG+), cares about pressings and condition, and buys
  second-hand on the Discogs marketplace.
- **When they use it:**
  - At home, browsing the collection and planning purchases.
  - On the phone while digging in a record shop or a fair: "Do I own this? Is it on my
    wantlist? What does it usually sell for?"
  - In the evening, checking whether anything on the wantlist has turned up at a good price.
- **What the app has to do well**, in order:
  1. Make the collection a pleasure to look at.
  2. Answer "is this worth buying" fast.
  3. Surface good records the user didn't know they wanted.

## What the app does today

### 1. Connect
The user connects their Discogs account with a **Connect with Discogs** button. They sign
in and approve access on discogs.com, then come back to the app. The app never sees their
password. They can disconnect at any time.

### 2. Home
A personal overview:
- greeting with the user's first name;
- the most recently added records (cover art);
- counts: records in the collection, records on the wantlist;
- collection value from Discogs (median, with a low–high range);
- entry points to finding wants for sale and to recommendations.

### 3. Collection
Every record the user owns. Can be several hundred to several thousand records.
- Search across artist, title, label and catalogue number.
- Filter by Discogs folder and by style (e.g. Hard Rock, Pop Rock, Prog Rock).
- Sort by recently added, artist, title, year, or the user's own rating.
- Opening a record leads to its Discogs page (a record detail screen inside the app is
  planned).

### 4. Wantlist
Records the user is looking for.
- Filter, and remove items.
- **Check price** per record, or **Check all prices**: number of copies for sale on
  Discogs and the lowest price. Each check is one API call, so checks run one at a time.

### 5. Sellers (seller match)
Discogs has no "every listing for a record" API, so the user chooses sellers they trust,
and the app scans those sellers' shop inventories for anything on the wantlist.
- **Inputs:**
  - a list of seller usernames;
  - how many pages of each shop to scan (100 listings per page, newest first; big shops
    have over a million listings).
- **Rules** (defaults in brackets):
  - minimum record grade (VG+);
  - minimum sleeve grade (VG), or ignore the sleeve;
  - whether to accept "Generic", "Not Graded" or "No Cover" sleeves (no);
  - minimum seller rating (98%);
  - minimum number of seller ratings (25);
  - maximum price (none);
  - ships from (United States). Accepts several countries, and "US"/"UK" style
    abbreviations.
- Runs as a **background job with a progress bar**, e.g. "Scanning recordsale-de:
  page 2/10", then "Checking market prices…".
- **Results:**
  - **Per-seller summary:** listings scanned, matches found, seller rating, whether the
    shop was too big to scan fully, and errors such as "seller does not exist".
  - **Matching listings, ranked 0–100.** The score weights record grade 35, sleeve 15,
    seller 30 and price 20, where price compares the listing with the cheapest copy on
    Discogs.
  - **Each listing shows:** cover, release description, record and sleeve grade, seller
    name, rating and number of ratings, ships-from country, whether the seller accepts
    offers, the price in the user's currency (and the seller's original currency if
    different), the score, and short reasons such as "media NM", "top-rated seller",
    "near lowest price".

### 6. Discover (recommendations)
- Builds a **taste profile** from the collection: top artists, labels, styles and decades.
  Records the user rated 4–5 stars count more.
- **Finds candidates from three places:**
  - the most-collected albums by the user's top artists;
  - the most-collected albums on the user's top labels, in the style the user collects most
    on that label;
  - the most-collected records in the user's top styles.
- Drops anything already owned or wanted, including other pressings of the same album.
- **Shows about 60 picks**, each with a 0–100 score and the reasons it was picked:
  - "you own 7 by AC/DC";
  - "Hard Rock on Columbia (38 in your collection)";
  - "matches your styles: Hard Rock, Blues Rock";
  - "highly wanted by the community".
- One tap adds a pick to the wantlist.
- Runs as a background job of about 15 API calls (half a minute), with progress messages.

## Data available

| Thing | Fields |
|---|---|
| Record (collection or wantlist item) | title, artists, year, labels with catalogue numbers, formats (e.g. Vinyl, LP, Album, Reissue), genres, styles, thumbnail (150px), cover image (up to 600px), date added, user's rating 0–5, Discogs release and master IDs |
| User's own grades | collection custom fields, usually record grade and sleeve grade (e.g. "Near Mint (NM or M-)", "Very Good Plus (VG+)") |
| Marketplace stats | copies for sale, lowest price (in the user's currency) |
| Listing (seller match) | record grade, sleeve grade, price (seller's currency and converted), ships from, seller username, rating %, number of ratings, accepts offers, comments, date listed |
| Profile | username, name, collection count, wantlist count, currency, location |
| Collection value | minimum, median, maximum (as formatted strings, e.g. "$4,989.83") |

**Grading scale**, best to worst: Mint (M), Near Mint (NM), Very Good Plus (VG+), Very Good
(VG), Good Plus (G+), Good (G), Fair (F), Poor (P). Sleeves can also be "Generic", "Not
Graded" or "No Cover".

### Real example content
Use this rather than lorem ipsum. It's what one real collection looks like.

- **Collection:** 374 records, all in one folder. Discogs values it at about $4,990
  (range $1,368–$23,490).
- **Top styles:** Hard Rock (110), Pop Rock (87), Prog Rock (53), Classic Rock (50).
- **Most recently added:**
  - *Brothers In Arms*, Dire Straits, 1985, Warner Bros. 1-25264; record Near Mint, sleeve VG+
  - *At Folsom Prison*, Johnny Cash, 1968, Columbia CS 9639
  - *Stand!*, Sly & The Family Stone, 1969, Epic BN 26456
  - *Fair Warning*, Van Halen, 1981, Warner Bros. HS 3540
  - *Tattoo You*, The Rolling Stones, 1981, Rolling Stones Records COC 16052
  - *Nursery Cryme*, Genesis, Charisma CAS 1052
- **Wantlist:** 63 records. With marketplace prices:

  | Record | Copies for sale | From |
  |---|---|---|
  | *Crime Of The Century*, Supertramp, 1974 | 5 | $6.00 |
  | *Tea For The Tillerman*, Cat Stevens, 1970 | 29 | $4.00 |
  | *Time Out*, The Dave Brubeck Quartet | 35 | $57.00 |
  | *Hotel California*, Eagles, 1977 | 7 | $5.90 |
  | *One Of These Nights*, Eagles, 1975 | 39 | $5.00 |

- **Example recommendations:**
  - *Presence*, Led Zeppelin, 1976: "you own 9 by Led Zeppelin"
  - *Dirty Deeds Done Dirt Cheap*, AC/DC, 1976
  - *Never Say Die!*, Black Sabbath, 1978
  - *Kiss*, Kiss, 1974: "Hard Rock on Columbia"
  - *Raw Power*, Iggy And The Stooges, 1973

## Screens and states to design

**Screens:**
- Connect
- Home
- Collection
- Record detail (planned)
- Wantlist
- Sellers, in two states: set-up, and results
- Discover

**Every screen also needs:**
- loading;
- empty (e.g. empty wantlist, no matches found);
- error, with a message that says what to do;
- progress, for the two background jobs.

**Navigation:** a bottom tab bar on phones (Home, Collection, Wantlist, Sellers, Discover)
and a side bar on desktop.

## Constraints

- **Platforms:**
  - Phone first: Android and iOS, built from the same web code with Capacitor.
  - Also a desktop web layout.
  - Respect safe areas: the notch and the home indicator.
- **Accessibility:**
  - WCAG AA contrast (4.5:1 for normal text);
  - touch targets at least 48px;
  - visible keyboard focus;
  - nothing that only works on hover;
  - respect "reduce motion";
  - text inputs at least 16px (stops iOS zooming in).
- **Discogs rules:**
  - Show "Data provided by Discogs" with a link.
  - Don't use the Discogs name or logo as the app's branding, and don't make the app look
    like Discogs.
  - Album art comes from Discogs image URLs and can fail to load, so design a fallback.
- **Speed:** Discogs allows 60 API requests a minute, so long jobs show progress, and
  prices are checked on request rather than all at once.
- **Copy:** plain sentence case, active voice, buttons say exactly what happens ("Check
  price", "Find your wants for sale"). Errors say what to do next.

## Visual direction chosen: "Listening Room"

Of three explored directions (a loud Risograph-print "shop flyer" look, a cube-shelf of
record spines, and this one), the owner chose **Listening Room** and wants it refined into
something spectacular.

- **Idea:** immersive and calm, like the room changing when you put a record on. Each
  screen takes its colour from the record in focus. A deep, desaturated version of the
  cover's main colour fills the background, with a soft pool of light behind the cover.
  Cover art is the hero.
- **Signature moment:** the latest or selected record sits half out of its sleeve and
  slowly turns, with the label coloured by the record's accent. The spin stops when the
  user prefers reduced motion.
- **Colour, example room** (*Brothers In Arms*):
  - background `#10273A` (deep steel blue)
  - text `#EAF1F6`
  - secondary text `#B7C8D6`
  - accent `#F2B544` (amber), for primary buttons and the active tab
  - For *Crime Of The Century* the room shifts to `#161A3D` (night blue) with accent
    `#F0C76B`.
- **Type:** Bricolage Grotesque (variable, optical sizes):
  - big tight record titles (36–42px, weight ~750, slight negative tracking);
  - 15–18px body text;
  - one family only.
- **Shapes:**
  - pill buttons (48–52px tall);
  - covers with small radius (3–4px) and deep soft shadows;
  - a translucent, blurred bottom tab bar.
- **Tone:** premium music app, not a dashboard. Few elements per screen; the record
  dominates.

### Already tried and rejected
- **Generic default:** warm cream background, terracotta accent, everything in identical
  rounded white cards with soft grey shadows.
- **Safe reskin:** a cool grey and blue palette with a plain cover grid. It worked, but
  the owner rated it "mid-level design at best".
- **Things to avoid:**
  - dashboard stat-card rows;
  - gradient washes as decoration;
  - all-caps labels above every heading;
  - emoji as icons;
  - a different accent colour on every element.

## What to ask for

Pick one and add it after the brief.

1. "Design the phone screens for Home, Collection, Wantlist, Sellers (results) and
   Discover in the Listening Room direction, 390×844. Use the real example content above."
2. "Push the Listening Room direction further. Give me three variations of the Home and
   Record detail screens, from restrained to bold, and explain what each one changes."
3. "Design a Record detail screen that works for both owned records (grades, catalogue
   number, date added) and wanted records (copies for sale, lowest price, matching
   listings)."
4. "Design the Sellers results screen: per-seller summary plus ranked listings with grade,
   seller rating, ships-from, price and score. It must be scannable on a phone in a record
   shop."
5. "Propose a completely different direction for this brief that is not Listening Room,
   and say why it fits these collectors."
