# Crate Companion: plan and design notes

## Discogs API constraints that shape the design

| Constraint | Effect on the app |
|---|---|
| **60 authenticated requests/min** (25 unauthenticated) | Everything goes through a server-side limiter and cache. Big jobs run in the background with progress. A 5,000-item collection takes about 50 calls (~1 min) to load the first time. |
| **No endpoint lists every marketplace listing for a release.** Only `/marketplace/stats/{id}` (count and lowest price) and per-seller `/users/{u}/inventory`. | Seller match works on a **list of sellers you choose** and scans their inventories. Inventories have no server-side filtering, so huge shops (50k+ listings) can't be fully scanned; "pages per seller" caps it, newest listings first. The Discogs site's own "Shop your wantlist" page covers every seller, so each result links out to it. |
| **Scraping discogs.com is against the Terms of Use** | We only use the API, so no scraping of marketplace pages to get around the limit above. |
| **No recommendations API** | We build our own from collection metadata (see below). |
| **A User-Agent is required, and attribution is required** | Set in `.env`. The UI footer shows "Data provided by Discogs". The app name avoids the Discogs trademark. |
| **Auth:** personal token (one user) or OAuth 1.0a (any user) | "Connect with Discogs" uses OAuth 1.0a (PLAINTEXT signature over HTTPS); a personal token in `.env` still works as a fallback. One connected account per server for now. |

## Recommendation approach (v0.1)

1. **Taste profile** from `basic_information` on every collection item. No extra API calls are
   needed. It weights artists, labels, styles, genres and decades. Items you rated 4–5★ count
   for more, and placeholders like "Various" and "Not On Label" are ignored.
2. **Candidates** come from three sources (about 13 API calls, cached 24 h):
   - albums by your top artists, most collected first (`/database/search?artist=…&format=album`,
     falling back to `/artists/{id}/releases`);
   - the most-collected masters on your top labels, in the style you collect most on each
     (`/database/search?label=…&style=…&sort=have`);
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
- [x] Verify against the live API with a real account, and adjust field mappings.
      Checked 2026-11-23 (374-item collection, 63 wants, `recordsale-de` inventory).
      Confirmed: inventory listings carry `seller.stats` (rating is a string, e.g. `"99.8"`);
      search results carry `community.want/have`; artist releases carry `stats.community`.
      Fixed: listing `release.thumbnail` (not `thumb`); listing `price` is in the *seller's*
      currency, so max price and the market-floor comparison now use
      `original_price.converted` (the buyer's currency, same as `/marketplace/stats`);
      profile currency is `curr_abbr`; releases that list a label once per catalog number
      no longer double-count it; search titles lose trailing spaces and ` (2)` suffixes;
      label-release candidates now use their `stats.community`.
- [x] Label recommendations: page 1 of `/labels/{id}/releases` was mostly unrelated or
      "Various" compilations for big labels (Warner Bros. has 160k releases), so no label
      pick ever reached the top 60. Now a `/database/search?label=…&style=…&type=master&sort=have`
      query per top label, using the style you collect most on that label, with "Various"
      dropped and at most 3 picks per artist. Live result: 48 of 60 picks come from labels.
      Caveat: search matches the label *name* anywhere on a release, so club pressings
      (e.g. Columbia House) bring in other labels' artists.
- [x] Artist picks are albums: discography masters carry no format, so each top artist is
      a `/database/search?artist=…&type=master&format=album&sort=have` query, keeping only
      results credited exactly to that artist (search is fuzzy) and skipping unofficial
      releases. Falls back to the discography when fewer than 3 albums are found.
      Live: artist picks went from 5 (some singles) to 18 albums.
- [ ] Persistent cache (SQLite) so restarts don't re-fetch everything, plus incremental
      collection sync.
- [ ] Wantlist notes and a per-item "max price"/"min grade" that overrides the global criteria.
- [ ] Saved seller lists. Suggest sellers from your Discogs order history (`/marketplace/orders`).
- [ ] Multiple accounts ("collections") and collection custom fields (e.g. media condition you own).
- [ ] Collection stats page (by decade, style, format, value).

### Phase 3: Multi-user and hosting
- [x] Discogs OAuth 1.0a sign-in ("Connect with Discogs": request token → authorize →
      access token), saved to `.cache/` so it survives restarts, with Disconnect.
- [ ] Per-user sessions: today one server holds one connected account. A hosted version needs
      a session cookie per browser and per-user token storage (encrypted).
- [ ] Deploy the server (e.g. Fly.io, Render or Cloudflare Workers) behind HTTPS.
- [ ] Scheduled "new match" checks with notifications.

### Phase 4: Android and iOS apps
- [ ] Wrap `web/` with **Capacitor**, which builds both the Android and the iOS app from the
      same code. The UI is already built for it: bottom tab bar, safe-area insets (notch and
      home bar), 48px touch targets, no hover-only controls, 16px inputs (no iOS zoom on focus),
      light and dark themes that follow the system, and the font bundled with the app.
- [ ] Point the apps at the hosted API from phase 3, and use a custom-scheme or app-link
      redirect for the OAuth callback.
- [ ] Open Discogs links in the in-app browser (Capacitor Browser plugin) instead of leaving the app.
- [ ] Barcode scanner to add records (Discogs search supports `barcode=`).
- [ ] Offline read-only cache of the collection.
- [ ] Store listings: Google Play (one-time developer fee) and the App Store (Apple Developer
      Program, yearly fee; building the iOS app needs a Mac with Xcode, or a cloud Mac build service).

Why Capacitor rather than React Native: it reuses this exact React UI, so the apps are mostly
packaging and native plugins (camera, push) rather than a rewrite.
