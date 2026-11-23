import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createApp } from './app';
import { DiscogsConnection } from './auth/connection';
import { ConnectionStore } from './auth/store';
import { config } from './config';
import { DiscogsClient } from './discogs/client';
import { MockDiscogs } from './discogs/mock';

let api: DiscogsClient | MockDiscogs;
let connection: DiscogsConnection | undefined;
if (config.mock) {
  api = new MockDiscogs();
} else {
  const client = new DiscogsClient({ userAgent: config.userAgent });
  api = client;
  connection = new DiscogsConnection({
    consumer: config.consumerKey && config.consumerSecret
      ? { key: config.consumerKey, secret: config.consumerSecret } : undefined,
    personalToken: config.token,
    personalUsername: config.username,
    userAgent: config.userAgent,
    store: new ConnectionStore(config.authFile),
    apply: (auth) => client.setAuth(auth),
    identify: (auth) => client.identify(auth),
  });
}

const root = new Hono();
root.route('/', createApp(api, { connection, userAgent: config.userAgent }));

if (config.production) {
  root.use('/*', serveStatic({ root: './dist' }));
  root.get('*', serveStatic({ path: './dist/index.html' }));
}

serve({ fetch: root.fetch, port: config.port }, ({ port }) => {
  let mode = 'MOCK data';
  if (connection) {
    const s = connection.status();
    mode = s.method === 'oauth' ? `connected to Discogs as ${s.username}`
      : s.method === 'token' ? 'Discogs token loaded'
      : s.canConnect ? 'not connected: open the app and click "Connect with Discogs"'
      : 'not connected: set DISCOGS_CONSUMER_KEY/SECRET (or DISCOGS_TOKEN) in .env';
  }
  console.log(`Crate Companion API on http://localhost:${port}  (${mode})`);
});
