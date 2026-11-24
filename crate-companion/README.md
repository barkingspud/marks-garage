# Crate Companion

A web app (Android and iOS apps to follow) for record collectors, built on the
[Discogs API](https://www.discogs.com/developers):

- **Home**: your latest record, cover in front and the record sliding out and turning.
- **Collection**: browse every folder as a cover grid or list, search by artist/title/label/cat#,
  and filter by style. On wide screens the selected record opens in a side panel.
- **Record detail**: your grades (from your Discogs collection fields) on the scale from Poor
  to Mint, catalog details, or, for wanted records, the current lowest price.
- **Record Check**: in a shop, find the exact pressing by text, catalog number or barcode
  (camera scanning where the browser supports it), see whether you own or want it, compare the
  asking price with Discogs listings, and add it to your collection when you buy it.
- **Wantlist**: view it, remove items, and check how many copies are for sale and the lowest price.
- **Seller match**: scan the shops of the sellers you choose for wantlist items that meet your
  rules (minimum media and sleeve grade, seller rating, number of ratings, max price, ships-from),
  ranked by a 0–100 score.
- **Discover**: recommendations built from the artists, labels, styles and decades you collect,
  each with the reason it was picked. One click adds a pick to your wantlist.

The look ("Listening Room"): each screen is a dim room tinted by the colors of the record in
focus, with frosted-glass controls and artwork in lifted cards. Glass sidebar on desktop,
floating tab bar on phones.

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

The app connects with a **Connect with Discogs** button: you sign in on discogs.com and approve
access, and the app never sees your password. For that, the app has to be registered with
Discogs once:

1. On Discogs, go to **Settings → Developers** (https://www.discogs.com/settings/developers)
   and click **Create an Application**. Any name and description will do.
2. Make a `.env` file from `.env.example` and fill in `DISCOGS_CONSUMER_KEY` and
   `DISCOGS_CONSUMER_SECRET` from that application. **Never commit it** (`.env` is git-ignored).
3. Run `npm run dev`, open http://localhost:5173 and click **Connect with Discogs**.

The connection is saved in `.cache/discogs-connection.json` (git-ignored), so you stay
connected after a restart. **Disconnect** is on the Home page and in the sidebar. To remove
the app's access on the Discogs side as well, revoke it in your Discogs settings.

**Personal token instead:** put a token from the same Developers page (**Generate new token**)
in `.env` as `DISCOGS_TOKEN`. A connected account takes priority over the token, and the token
is used again after you disconnect.

To keep `.env` outside the repo, point the app at it:

PowerShell:
```powershell
$env:DISCOGS_ENV_FILE = "C:\path\to\Discogs App\.env"; npm run dev
```
bash:
```bash
DISCOGS_ENV_FILE="/path/to/.env" npm run dev
```

## AI features

Five features use Claude (Anthropic). There are two ways to get them:

- **Included AI** (no setup): app builds made with an AI server address send AI requests to the
  Crate Companion AI server, which runs them on Haiku 5.5 with the app's own key. Each install
  gets **150 uses a month** (a photo identify counts as one use). Settings shows how many are left.
- **Your own Anthropic key** (optional, in Settings): no monthly limit, a **model picker** (Haiku
  5.5, Sonnet 5.5 or Opus 5.5), and an **AI costs** panel with what each use cost, billed to your
  Anthropic account.

| Feature | Where | What it does |
|---|---|---|
| Identify from photos | Check an album, camera button | Reads the cover, label, barcode or runout in up to 4 photos, searches Discogs, and picks the matching pressing. |
| Ask for something specific | Discover | Recommendations from a request in your own words. Every pick is checked against Discogs; ones Discogs doesn't list are left out. |
| AI review | Favorite shops results | Reads every listing, including the seller's notes, and marks each one Great buy, Good, Careful or Skip. |
| About this album | Album page | Notes on why the album matters, what to listen for, and what's notable about this pressing. |
| What should I play tonight? | Home | Picks from your own albums for a mood. |

A key of your own is checked with Anthropic, then kept on the device (in the installed apps) or
in `.cache/` (web version). The app sends only what a feature needs, and only when you tap it.
Code: `core/ai/` (`tasks.ts` has each AI task's instructions and answer shape; `llm.ts` runs a
task through the official SDK with structured outputs; `features.ts` builds each feature from
tasks and checks the answers against Discogs). The models and their prices are in
`shared/ai-models.ts`.

### AI server

`ai-server/` is a Cloudflare Worker (free plan) that holds the app's Anthropic key. It runs only
the app's own tasks from `core/ai/tasks.ts`, always on Haiku 5.5, and enforces the limits in
`ai-server/wrangler.toml`:

| Setting | Default | What it does |
|---|---|---|
| `MONTHLY_USES` | 150 | AI uses per install per month |
| `IP_DAILY_REQUESTS` | 300 | Requests per network address per day, so reinstalling doesn't get around the cap |
| `MONTHLY_BUDGET_USD` | 10 | When the month's spend reaches this, the included AI pauses until next month |
| `AI_ENABLED` | true | Set to "false" to turn the included AI off |

It keeps counts (uses per install, spend per month) and **shared album notes**: notes written by the
included AI are kept per pressing (Discogs release ID) and served free to the next person who
opens it. It never keeps what anyone asked.
`.github/workflows/crate-companion-ai-server.yml` deploys it from `main` once these repository
secrets are set: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `ANTHROPIC_API_KEY`. Set the
server's address as the repository **variable** `AI_SERVER_URL`, and the Android build includes
it. For the web version, set `AI_SERVER_URL` in `.env`. Run it locally with
`npx wrangler dev -c ai-server/wrangler.toml`.

## Android app

The Android app runs everything on the phone: no PC or server needed. GitHub builds it
automatically (workflow: `.github/workflows/crate-companion-android.yml`).

**Install it on your phone (debug build):**

1. On GitHub, open **Actions**, then **Crate Companion Android**, then the latest green run.
2. Under **Artifacts**, download `crate-companion-debug-…` and unzip it.
3. Copy the `.apk` to your phone and open it. Android asks to allow installing apps from
   that source (your browser or file manager) the first time.

**Repository secrets** (Settings, Secrets and variables, Actions):

| Secret | What it's for |
|---|---|
| `DISCOGS_CONSUMER_KEY`, `DISCOGS_CONSUMER_SECRET` | "Connect with Discogs" in the app. Without them the app offers personal-token sign-in and demo data. |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | Signed release builds (APK and Play Store AAB). |

Locally, with Android Studio installed: `npm run android:sync`, then `npm run android:open`.

How it fits together: `capacitor.config.ts` (app ID `io.github.barkingspud.cratecompanion`),
`android/` (the Android project), `web/src/native/capacitor.ts` (the bridge: native networking,
on-device storage, the Discogs sign-in returning to `cratecompanion://auth`, Google's barcode
scanner, keep-awake during scans), `assets/` (icon and launch-screen sources).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API server (port 8787) and web app (port 5173); the web app hot-reloads |
| `npm run mock` | Same, using built-in demo data instead of Discogs |
| `npm run dev:watch` | Like `dev`, but the API server also restarts when its code changes. Can hang in a OneDrive-synced folder. |
| `npm test` | Unit tests for grading, matching, recommendations and services |
| `npm run typecheck` | TypeScript check |
| `npm run build` then `npm start` | Production build served by the API server on port 8787 |
| `npm run android:sync` | Build the web app and copy it into the Android project |

## How it works

```
core/     Everything the app does: Discogs client (rate limit, cache, retries), sign-in,
          background jobs, seller match and recommendations. No PC-only code, so it runs
          in Node (the web version's server) and inside the Android and desktop apps.
server/   Hono server for the web version: the core over HTTP, plus file storage.
web/      React + Vite UI. Talks to the server, or runs the core itself ("local mode").
shared/   Pure logic and types: condition grades, seller-match scoring, recommendation scoring.
```

The core:

- stays under Discogs' **60 requests/minute** limit and retries on 429;
- caches GET responses (collection 5 min, inventories 2 h, artist/label/search 24 h);
- runs long scans (seller inventories, recommendations) as background jobs with progress.

**Local mode** (no server). The installed apps always run this way. To try it in a browser,
open the app with `?local=1` (`?local=0` switches back). You can sign in with a personal
token, or look around with demo data. Discogs only lets browsers *read*, so in a plain
browser, actions that change your Discogs data (wantlist, adding to the collection) and
finishing "Connect with Discogs" need the apps' native network bridge (`window.crateNative`).
App builds read the Discogs app registration from `VITE_DISCOGS_CONSUMER_KEY` and
`VITE_DISCOGS_CONSUMER_SECRET`.

See [`docs/PLAN.md`](docs/PLAN.md) for the roadmap, the Discogs API limits that shaped the
design, and the Android and iOS plan.
