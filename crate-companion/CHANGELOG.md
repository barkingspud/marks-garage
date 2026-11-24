# Changelog

## Unreleased

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
