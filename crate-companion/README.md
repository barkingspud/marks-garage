# Crate Companion

A web app (Android to follow) for record collectors, built on the
[Discogs API](https://www.discogs.com/developers):

- **Collection**: browse every folder, search by artist/title/label/cat#, and filter by style.
- **Wantlist**: view it, remove items, and check how many copies are for sale and the lowest price.
- **Seller match**: scan the shops of the sellers you choose for wantlist items that meet your
  rules (minimum media and sleeve grade, seller rating, number of ratings, max price, ships-from),
  ranked by a 0–100 score.
- **Discover**: recommendations built from the artists, labels, styles and decades you collect,
  each with the reason it was picked. One click adds a pick to your wantlist.

> Data provided by Discogs. This project is not affiliated with or endorsed by Discogs.

## Setup

Requires Node.js 20+.

```bash
cd crate-companion
npm install
```

### Try it with demo data (no account needed)

```bash
npm run mock
```

Open http://localhost:5173.

### Use your own Discogs account

1. On Discogs, go to **Settings → Developers** (https://www.discogs.com/settings/developers)
   and click **Generate new token**.
2. Make a `.env` file from `.env.example` and fill in `DISCOGS_TOKEN` (and `DISCOGS_USERNAME`
   if you like). **Never commit it.** `.env` is git-ignored, but it is safer to keep it outside
   the repo entirely and point the app at it:

   PowerShell:
   ```powershell
   $env:DISCOGS_ENV_FILE = "C:\path\to\Discogs App\.env"; npm run dev
   ```
   bash:
   ```bash
   DISCOGS_ENV_FILE="/path/to/.env" npm run dev
   ```
3. Open http://localhost:5173.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API server (port 8787) and web app (port 5173); the web app hot-reloads |
| `npm run mock` | Same, using built-in demo data instead of Discogs |
| `npm run dev:watch` | Like `dev`, but the API server also restarts when its code changes. Can hang in a OneDrive-synced folder. |
| `npm test` | Unit tests for grading, matching, recommendations and services |
| `npm run typecheck` | TypeScript check |
| `npm run build` then `npm start` | Production build served by the API server on port 8787 |

## How it works

```
web/      React + Vite UI (works as an installable PWA; wraps for Android with Capacitor later)
server/   Hono API server: holds the token, rate-limits and caches calls to Discogs
shared/   Pure logic used by both: condition grades, seller-match scoring, recommendation scoring
```

The browser never sees your token. Every Discogs call goes through `server/`, which:

- stays under Discogs' **60 requests/minute** limit (sliding window plus the
  `X-Discogs-Ratelimit-Remaining` header) and retries on 429;
- caches GET responses (collection 5 min, inventories 2 h, artist/label/search 24 h);
- runs long scans (seller inventories, recommendations) as background jobs that the UI polls for progress.

See [`docs/PLAN.md`](docs/PLAN.md) for the roadmap, the Discogs API limits that shaped the
design, and the Android plan.
