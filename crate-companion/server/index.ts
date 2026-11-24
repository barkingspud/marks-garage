import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { CrateCore } from '../core/crate';
import { createApp } from './app';
import { config } from './config';
import { FileStore } from './file-store';

const core = await CrateCore.create({
  mock: config.mock,
  userAgent: config.userAgent,
  store: new FileStore(config.authFile),
  consumer: config.consumerKey && config.consumerSecret ? { key: config.consumerKey, secret: config.consumerSecret } : undefined,
  personalToken: config.token,
  personalUsername: config.username,
  aiServer: config.aiServer,
});

const root = new Hono();
root.route('/', createApp(core));

if (config.production) {
  root.use('/*', serveStatic({ root: './dist' }));
  root.get('*', serveStatic({ path: './dist/index.html' }));
}

serve({ fetch: root.fetch, port: config.port }, ({ port }) => {
  let mode = 'MOCK data';
  if (core.connection) {
    const s = core.connection.status();
    mode = s.method === 'oauth' ? `connected to Discogs as ${s.username}`
      : s.method === 'token' ? 'Discogs token loaded'
      : s.canConnect ? 'not connected: open the app and click "Connect with Discogs"'
      : 'not connected: set DISCOGS_CONSUMER_KEY/SECRET (or DISCOGS_TOKEN) in .env';
  }
  console.log(`Crate Companion API on http://localhost:${port}  (${mode})`);
});
