import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { CrateCore, CrateError, errorStatus } from '../core/crate';

/**
 * The address the browser used to reach us. In development the web app (port 5173) proxies
 * /api to this server (port 8787) and passes its own address as X-Forwarded-Host; Discogs must
 * send the user back there, because port 8787 serves no pages in development.
 */
export function publicOrigin(requestUrl: string, forwardedHost?: string, forwardedProto?: string): string {
  const url = new URL(requestUrl);
  const host = forwardedHost?.split(',')[0]?.trim();
  if (!host) return url.origin;
  const proto = forwardedProto?.split(',')[0]?.trim() || url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

/** The web version's server: the core (core/crate.ts) over HTTP. */
export function createApp(core: CrateCore) {
  const app = new Hono().basePath('/api');

  app.onError((err, c) => {
    const { status, message } = errorStatus(err);
    if (status >= 500) console.error(err);
    return c.json({ error: message }, status as ContentfulStatusCode);
  });

  const num = (c: Context, name: string) => Number(c.req.param(name));

  app.get('/status', async (c) => c.json(await core.status()));
  app.get('/me', async (c) => c.json(await core.profile()));
  app.get('/folders', async (c) => c.json(await core.folders()));
  app.get('/collection', async (c) => c.json(await core.collection(Number(c.req.query('folder') ?? 0))));
  app.get('/collection/fields', async (c) => c.json(await core.fields()));
  app.post('/collection', async (c) => {
    const b = await c.req.json<{ releaseId?: number; removeFromWants?: boolean }>();
    return c.json(await core.addToCollection(b.releaseId ?? 0, b.removeFromWants));
  });
  app.post('/collection/rating', async (c) => c.json(await core.rate(await c.req.json())));
  app.get('/releases/:releaseId', async (c) => c.json(await core.release(num(c, 'releaseId'))));
  // AI (the user's own Anthropic API key, saved on the server's disk in server mode)
  app.get('/ai/status', async (c) => c.json(await core.aiStatus()));
  app.post('/ai/key', async (c) => c.json(await core.aiSetKey((await c.req.json<{ key?: string }>()).key ?? '')));
  app.delete('/ai/key', async (c) => c.json(await core.aiRemoveKey()));
  app.post('/ai/model', async (c) => c.json(await core.aiSetModel((await c.req.json<{ model?: string }>()).model ?? '')));
  app.get('/ai/usage', async (c) => c.json(await core.aiUsage()));
  app.get('/ai/allowance', async (c) => c.json(await core.aiAllowance()));
  app.delete('/ai/usage', async (c) => c.json(await core.aiClearUsage()));
  app.post('/ai/identify', async (c) => c.json(await core.aiIdentify(await c.req.json())));
  app.post('/ai/recommend', async (c) => c.json(await core.aiRecommend(await c.req.json())));
  app.post('/ai/review', async (c) => c.json(await core.aiReviewListings(await c.req.json())));
  app.get('/ai/notes/:releaseId', async (c) => c.json(await core.aiNotes(num(c, 'releaseId'))));
  app.post('/ai/tonight', async (c) => c.json(await core.aiTonight(await c.req.json())));
  app.get('/wants', async (c) => c.json(await core.wants()));
  app.post('/wants', async (c) => c.json(await core.addWant(await c.req.json())));
  app.delete('/wants/:releaseId', async (c) => c.json(await core.removeWant(num(c, 'releaseId'))));
  app.get('/stats/:releaseId', async (c) => c.json(await core.stats(num(c, 'releaseId'), c.req.query('currency'))));
  app.get('/search/releases', async (c) => c.json(await core.searchReleases({ q: c.req.query('q'), barcode: c.req.query('barcode'), catno: c.req.query('catno') })));
  app.get('/img', async (c) => {
    const img = await core.image(c.req.query('u') ?? '');
    return new Response(img.body, { headers: { 'Content-Type': img.type, 'Cache-Control': 'public, max-age=604800, immutable' } });
  });
  app.post('/jobs/match', async (c) => c.json(await core.startMatch(await c.req.json())));
  app.post('/jobs/recommend', async (c) => c.json(await core.startRecommend()));
  app.get('/jobs/:id', (c) => c.json(core.job(c.req.param('id'))));

  // ------------------------------------------------ Connect with Discogs (OAuth)
  // These are page navigations, not fetches, so they answer with redirects.

  const back = (c: Context, e: unknown) => {
    console.error(e);
    return c.redirect(`/?connect_error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  };
  app.get('/auth/connect', async (c) => {
    if (!core.connection) return c.redirect('/');
    try {
      const callback = `${publicOrigin(c.req.url, c.req.header('x-forwarded-host'), c.req.header('x-forwarded-proto'))}/api/auth/callback`;
      return c.redirect(await core.connectBegin(callback));
    } catch (e) { return back(c, e); }
  });
  app.get('/auth/callback', async (c) => {
    if (!core.connection) return c.redirect('/');
    // Discogs sends ?denied=<token> when the user clicks "Cancel".
    if (c.req.query('denied')) return back(c, new Error('Connection canceled on Discogs.'));
    const token = c.req.query('oauth_token');
    const verifier = c.req.query('oauth_verifier');
    if (!token || !verifier) return back(c, new Error('Discogs did not finish the sign-in.'));
    try {
      await core.connectFinish(token, verifier);
      return c.redirect('/');
    } catch (e) { return back(c, e); }
  });
  app.post('/auth/token', async (c) => c.json(await core.useToken((await c.req.json<{ token?: string }>()).token ?? '')));
  app.post('/auth/disconnect', async (c) => c.json(await core.disconnect()));

  return app;
}

export { CrateError };
