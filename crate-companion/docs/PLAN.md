# Crate Companion: plan and design notes

## Discogs API constraints that shape the design

| Constraint | Effect on the app |
|---|---|
| **60 authenticated requests/min** (25 unauthenticated) | Everything goes through a server-side limiter and cache. Big jobs run in the background with progress. A 5,000-item collection takes about 50 calls (~1 min) to load the first time. |
| **No endpoint lists every marketplace listing for a release.** Only `/marketplace/stats/{id}` (count and lowest price) and per-seller `/users/{u}/inventory`. | Seller match works on a **list of sellers you choose** and scans their inventories. Inventories have no server-side filtering, so huge shops (50k+ listings) can't be fully scanned; "pages per seller" caps it, newest listings first. The Discogs site's own "Shop your wantlist" page covers every seller, so each result links out to it. |
| **Scraping discogs.com is against the Terms of Use** | We only use the API, so no scraping of marketplace pages to get around the limit above. |
| **No recommendations API** | We build our own from collection metadata (see below). |
| **A User-Agent is required, and attribution is required** | Set in `.env`. The UI footer shows "Data provided by Discogs". The app name avoids the Discogs trademark. |
| **Auth:** personal token (one user) or OAuth 1.0a (any user) | v0.1 uses a personal token. OAuth is needed before other people (or the Play Store build) can sign in. |

## Recommendation approach (v0.1)

1. **Taste profile** from `basic_information` on every collection item. No extra API calls are
   needed. It weights artists, labels, styles, genres and decades. Items you rated 4–5★ count
   for more, and placeholders like "Various" and "Not On Label" are ignored.
2. **Candidates** come from three sources (about 13 API calls, cached 24 h):
   - discographies of your top artists (`/artists/{id}/releases`, main roles only);
   - catalogs of your top labels (`/labels/{id}/releases`);
   - masters in your top styles (`/database/search?style=…&type=master`).
3. **Filter** out anything you own or already want (matched by release *and* master, so other
   pressings don't come back).
4. **Score** each candidate 0–100: style overlap 30%, artist affinity 25%, community demand
   (want/have) 15%, genre 10%, label 10%, decade 10%. There is a bonus when more than one source
   found the same record. Each result shows *why* it was picked.

Ideas for later: "you own 3 of 5 albums by X, here are the missing 2"; style + decade searches;
similar-label clusters; letting users thumbs-down a pick to tune the weights; an optional
Claude-written "why you'd like this" note.

## Roadmap

### Phase 1: Web MVP ✅ (v0.1)
Collection, wantlist, seller match, recommendations, demo mode, tests.

### Phase 2: Make it solid
- [ ] Verify against the live API with a real account, and adjust field mappings
      (seller stats on inventory listings, search `community` field, and so on).
- [ ] Persistent cache (SQLite) so restarts don't re-fetch everything, plus incremental
      collection sync.
- [ ] Wantlist notes and a per-item "max price"/"min grade" that overrides the global criteria.
- [ ] Saved seller lists. Suggest sellers from your Discogs order history (`/marketplace/orders`).
- [ ] Multiple accounts ("collections") and collection custom fields (e.g. media condition you own).
- [ ] Collection stats page (by decade, style, format, value).

### Phase 3: Multi-user and hosting
- [ ] Discogs OAuth 1.0a sign-in (request token → authorize → access token); per-user sessions.
- [ ] Deploy the server (e.g. Fly.io, Render or Cloudflare Workers) behind HTTPS.
- [ ] Scheduled "new match" checks with notifications.

### Phase 4: Android
- [ ] Wrap `web/` with **Capacitor**. The UI is already mobile-first, with a bottom tab bar
      and safe-area insets.
- [ ] Point the app at the hosted API from phase 3, and use a custom-scheme or app-link
      redirect for the OAuth callback.
- [ ] Barcode scanner to add records (Discogs search supports `barcode=`).
- [ ] Offline read-only cache of the collection.
- [ ] Play Store listing.

Why Capacitor rather than React Native: it reuses this exact React UI, so the Android app is
mostly packaging and native plugins (camera, push) rather than a rewrite.
