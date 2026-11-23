import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createApp } from './app';
import { config } from './config';
import { DiscogsClient } from './discogs/client';
import { MockDiscogs } from './discogs/mock';

const api = config.mock ? new MockDiscogs() : new DiscogsClient({ token: config.token, userAgent: config.userAgent });
const root = new Hono();
root.route('/', createApp(api, { username: config.username, hasToken: !!config.token }));

if (config.production) {
  root.use('/*', serveStatic({ root: './dist' }));
  root.get('*', serveStatic({ path: './dist/index.html' }));
}

serve({ fetch: root.fetch, port: config.port }, ({ port }) => {
  const mode = config.mock ? 'MOCK data' : config.token ? 'Discogs token loaded' : 'NO TOKEN — set DISCOGS_TOKEN';
  console.log(`Crate Companion API on http://localhost:${port}  (${mode})`);
});
