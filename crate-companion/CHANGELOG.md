# Changelog

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
