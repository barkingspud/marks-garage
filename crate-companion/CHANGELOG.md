# Changelog

## Unreleased

**CDs and cassettes**, alongside vinyl:

- Album pages, Home and the collection panel show a CD in its jewel case with a silver disc,
  or a cassette in its case with the tape sliding out, instead of the record, in the same style.
- Condition grades are named for the format: Vinyl and Sleeve, Disc and Case, Tape and Case.
  Favorite shops names its rules for what's on your wantlist ("Media grade" when it's mixed),
  and each listing's grades for its own format.
- A Format filter in Collection and Wantlist when you have more than one format.
- The AI knows about all three: photo identify reads CD matrix and SID codes and cassette
  shells, and recommendations, notes and listing reviews no longer assume vinyl. Album notes
  say "This edition" for CDs and cassettes.

- **Adding Favorite shops is easier.** Type a seller name or paste a Discogs link (a shop page,
  a profile or any listing); the app shows the shop (name, location, seller rating, items for
  sale) before you add it. On Android, share a Discogs listing to Crate Companion from the
  browser or the Discogs app to add its seller. With no shops yet, the screen explains where to
  find them. Your shops are still kept only on your phone.

- **Shared album notes.** Notes written by the included AI are kept on the AI server for that
  pressing, so the next person to open it sees them right away, free and without using any of
  their monthly AI uses. The first person still taps "Write notes with AI" (one use). Notes
  written with your own Anthropic key stay private.

Bug fixes from the UI/UX review (no visual redesign):

- Check an album no longer says "Not in your collection or wantlist" while your collection is
  still loading or failed to load; it says "Checking your collection…" or offers Try again, and
  I bought it waits until ownership is known.
- Check an album shows every matching pressing ("Show all 14 pressings"), not just the first six.
- After I bought it, switching to another pressing no longer shows "Added to your collection".
- If the price lookup fails, Check an album says so, with Try again.
- Going back from an album to the Collection keeps your search, filter, sort and place in the
  list. In the list view, the whole row opens the album, not just the title.
- Home shows the collection value under Recently added, not inside the wantlist card.
- The personal token on the sign-in screen is hidden as you type, with Show token.

- "Surprise me" gives different picks each time: the album list is shuffled and the last picks
  are skipped. (Asked exactly the same thing, the AI kept giving the same four albums.)
- **AI without a key.** App builds can include AI through the new Crate Companion AI server
  (`ai-server/`, a Cloudflare Worker): Haiku 5.5, 150 uses per install per month, with a monthly
  budget for the whole app. Settings shows the uses left. A key of your own is still an option,
  for no limit and a choice of model.
- The AI's instructions now live in one place (`core/ai/tasks.ts`) as fixed tasks, which is what
  the AI server accepts.

- Fixed: Disconnect seemed to do nothing (the screen still said "Signed in as…" until the app was
  restarted). The app now starts over at the sign-in screen.
- Fixed: identifying a second album from photos (or a second search on Check an album) could
  leave a black screen until the app was restarted. If a page ever hits an error now, it shows a
  message with Try again instead.
- **Choose the AI model** in Settings: Haiku 5.5 (the new default, under 1¢ a use), Sonnet 5.5
  or Opus 5.5 (the previous model, about 5 to 20¢ a use).
- **AI costs** in Settings: what the AI has cost this month and all time, and the average cost
  per use by feature and model, worked out from the tokens Anthropic reports.
- Album notes say which model wrote them, with "Write again" after you switch models.

- Home features an **Album of the day** instead of the last album added: a different album each
  day, favoring 5- and 4-star albums, with a line on why ("Added to your collection on this day
  in 2019", "Turns 50 this year", "One of your 5-star albums"). A shuffle button shows another.

- Long album titles in lists wrap to two lines instead of running off the screen.
- AI recommendations show an album's original year (Discogs search can give a reissue's year).

**AI features (0.3.0)**, using Claude with your own Anthropic API key (Settings):

- Identify a pressing from photos of the cover, label, barcode or runout (Check an album).
- Ask for recommendations in your own words (Discover). Picks are checked against Discogs.
- AI review of seller listings, reading the sellers' notes (Favorite shops).
- Notes on an album and its pressing (album page).
- "What should I play tonight?" picks from your own albums (Home).
- New Settings page: Discogs account (with Disconnect on phones too) and the AI key.

- The app says "albums" instead of "records" (Check an album, Open album, 374 albums). The
  disc's condition grade is labeled "Vinyl" (next to "Sleeve").
- Long release notes show the first five lines, with "Show more" for the rest.

**Record details, ratings and kept results.**

- Record pages show the track listing (with running time), credits, the barcode and runout
  etchings that identify the pressing, notes, and the Discogs community rating.
- Any pressing can be opened, not just ones you own or want, with Add to wantlist.
- Rate your records (1 to 5 stars) on the record page and in the collection side panel.
  Ratings save to Discogs and show in the collection list view.
- The wantlist has a list view, like the collection.
- Android test builds share one signing key, so a new build installs over the old one.
- "Identifying this pressing" starts collapsed when it has more than three entries, showing one
  barcode and the first runout etchings, with "Show all" for the rest.
- Sellers moved off the bottom bar: it's now "Favorite shops", opened from the Wantlist.
- Recommendations and seller scans keep running when you switch pages, and the last result
  is kept until you run it again (also after closing the app).

**Android app (0.2.0).**

- Crate Companion as an installable Android app that runs entirely on the phone.
- Native networking, so the app can change your wantlist and collection (Discogs blocks this
  from web pages).
- Sign-in kept on the phone and excluded from cloud backup and device transfer.
- "Connect with Discogs" opens Discogs in a browser tab and returns to the app.
- Record Check scans barcodes with Google's scanner.
- The screen stays on during seller scans and recommendations.
- App icon and launch screen.
- GitHub Actions builds a debug APK on every change, and signed release builds once the
  signing secrets are set.
- Web: the barcode camera explains when it needs a secure (https) connection.

**Groundwork for standalone apps.**

- New `core/`: everything the server did (Discogs client, rate limiting, caching, sign-in,
  background jobs, seller match, recommendations) with no PC-only code, so it can run inside
  the Android and desktop apps. The server is now a thin layer over it.
- Local mode: the web app can run the core itself with no server (`?local=1`), signing in with
  a personal token or using demo data. Pending sign-ins survive a reload.
- Sign in with a personal token from inside the app (checked with Discogs, kept on the device).
- An existing saved sign-in keeps working after the update.

**New look and two new screens.**

- "Listening Room" design across the app: a dim room tinted from the record in focus (color
  read from the real cover), frosted-glass controls, artwork in lifted square cards, grain,
  amber only for prices, scores and the main action. Bricolage Grotesque, bundled.
- Glass sidebar on desktop; floating tab bar on phones.
- Home: the latest record's cover in front with its record sliding out and turning.
- Collection: cover grid or list, style chips, and a side panel for the selected record on wide screens.
- Record detail (new): your record and sleeve grades from your collection fields, catalog
  details, styles; for wanted records, the current lowest price and listing count.
- Record Check (new): search by text, catalog number or barcode (camera scanning where
  supported), pick the exact pressing, see owned/wanted status, compare a shop's price with the
  cheapest Discogs listing, and "I bought it" to add it to your collection.
- Wantlist: cover grid with frosted price tags and per-record Check price.
- Sellers: setup, a turning-record progress ring while scanning, and ranked results with grade
  chips, big scores, seller trust and price with shipping where available.
- Discover: top pick with a score ring and reasons, then more picks with one-tap add.
- Server: cover image pass-through (Discogs images only) so the app can read colors; collection
  custom fields; release search; add to collection.

Field mappings checked against the live Discogs API.

- Seller match compares prices in your own currency (`original_price.converted`) for the
  max-price rule and the market-floor score, and shows the seller's original price as well.
- Seller match covers now show (the API calls the field `release.thumbnail`).
- Taste profile counts each label once per release, even when it's listed for each catalog number.
- Recommendations from searches drop Discogs' " (2)" artist suffixes and stray spaces.
- Seller match ships-from filter now defaults to the United States, ignores case, accepts
  abbreviations like "US"/"USA"/"UK", and lets you type commas to list several countries.
- Label recommendations now search each top label for its most-collected masters in the
  style you collect most on that label, instead of the first page of the label's raw catalog
  (which was mostly compilations and unrelated records). Recommendations are capped at 3 per
  artist, and the "*" Discogs adds to name variations is dropped.
- Recommendations from your top artists are now their albums, most collected first, instead
  of the start of their discography (which included singles).
- `npm run dev` and `npm run mock` no longer start the API server in watch mode, which hung
  with no error in a OneDrive-synced folder on Windows. Use `npm run dev:watch` for that.
- **Connect with Discogs**: sign in on discogs.com and approve access (OAuth 1.0a) instead of
  pasting a token into `.env`. Needs the app registered once with Discogs
  (`DISCOGS_CONSUMER_KEY`/`SECRET`). The connection survives restarts, and Disconnect is on the
  Home page and in the sidebar. A personal `DISCOGS_TOKEN` still works as a fallback.
- **New look**: cover art first. Collection and wantlist are cover grids (a compact list on
  phones); Home opens on your latest records, overlapping like a record-shop bin; prices sit on
  yellow price stickers. Cool gray and divider-blue palette with a dark theme, one bundled
  typeface (Archivo, condensed for titles). Covers that fail to load fall back to a drawn label.
- Accessibility and touch: text meets WCAG AA contrast in both themes, 48px touch targets on
  touch screens, visible keyboard focus, reduced-motion support, empty-state messages, and
  labeled remove buttons.
- Types updated: `curr_abbr` on profiles, collection custom-field `notes`, listing `original_price`.

## 0.1.0 (2026-11-23)

First working web version.

- Collection browser with folders, search, style filter and sorting.
- Wantlist with remove, plus marketplace stats (copies for sale and lowest price).
- Seller match: scans the inventories of chosen sellers against the wantlist, filters on media
  and sleeve grade, seller rating and volume, price and ships-from, and scores the results.
- Discover: taste profile plus ranked recommendations from top artists, labels and styles,
  with add-to-wantlist.
- Rate-limited, caching Discogs proxy server using personal-token auth.
- Demo mode (`npm run mock`) with generated data.
- Responsive layout with a bottom tab bar on phones, and a PWA manifest.
