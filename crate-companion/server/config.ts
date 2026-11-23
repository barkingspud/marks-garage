import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';

// Keys can live outside the repo (e.g. your OneDrive project folder):
//   DISCOGS_ENV_FILE="C:\Users\...\Discogs App\.env" npm run dev
const envFile = process.env.DISCOGS_ENV_FILE;
if (envFile) {
  if (!existsSync(envFile)) throw new Error(`DISCOGS_ENV_FILE not found: ${envFile}`);
  loadEnv({ path: envFile });
} else {
  loadEnv();
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  mock: process.env.DISCOGS_MOCK === '1',
  token: process.env.DISCOGS_TOKEN?.trim() || undefined,
  consumerKey: process.env.DISCOGS_CONSUMER_KEY?.trim() || undefined,
  consumerSecret: process.env.DISCOGS_CONSUMER_SECRET?.trim() || undefined,
  /** Where the "Connect with Discogs" sign-in is saved (git-ignored). */
  authFile: process.env.DISCOGS_AUTH_FILE?.trim() || '.cache/discogs-connection.json',
  username: process.env.DISCOGS_USERNAME?.trim() || undefined,
  userAgent:
    process.env.DISCOGS_USER_AGENT?.trim() ||
    'CrateCompanion/0.1 +https://github.com/barkingspud/marks-garage',
  production: process.env.NODE_ENV === 'production',
};
