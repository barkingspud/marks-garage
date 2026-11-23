# Changelog

## Unreleased

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
