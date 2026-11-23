# Changelog

## Unreleased

Field mappings checked against the live Discogs API.

- Seller match compares prices in your own currency (`original_price.converted`) for the
  max-price rule and the market-floor score, and shows the seller's original price as well.
- Seller match covers now show (the API calls the field `release.thumbnail`).
- Taste profile counts each label once per release, even when it's listed for each catalog number.
- Recommendations from style searches drop Discogs' " (2)" artist suffixes and stray spaces,
  and label picks use community want/have counts.
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
