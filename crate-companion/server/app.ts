import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DEFAULT_CRITERIA, type MatchCriteria } from '../shared/matching';
import type { DiscogsConnection } from './auth/connection';
import type { DiscogsApi } from './discogs/api';
import { DiscogsError } from './discogs/client';
import { getJob, startJob } from './lib/jobs';
import { buildRecommendations, fetchCollection, fetchWants, runSellerMatch } from './services';

export function createApp(api: DiscogsApi, opts: { connection?: DiscogsConnection } = {}) {
  const app = new Hono().basePath('/api');
  const conn = opts.connection;
  let mockUser: string | undefined;

  async function me(): Promise<string> {
    if (api.isMock) return (mockUser ??= (await api.identity()).username);
    if (!conn?.connected) {
      throw new HTTPException(401, { message: 'Not connected to Discogs. Use "Connect with Discogs" on the start page.' });
    }
    return conn.currentUsername(async () => (await api.identity()).username);
  }

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    const status = err instanceof DiscogsError ? err.status : 500;
    console.error(err);
    return c.json({ error: err.message }, status === 401 || status === 404 || status === 429 ? status : 502);
  });

  app.get('/status', async (c) => {
    let user: string | null = null;
    try { user = await me(); } catch { /* not configured */ }
    return c.json({
      mock: api.isMock, configured: api.isMock || !!conn?.connected, username: user,
      requestsInWindow: api.requestsInWindow(), auth: conn?.status() ?? null,
    });
  });

  // ------------------------------------------------ Connect with Discogs (OAuth)
  // These are page navigations, not fetches, so they answer with redirects.

  app.get('/auth/connect', async (c) => {
    if (!conn) return c.redirect('/');
    try {
      const callback = new URL('/api/auth/callback', c.req.url).toString();
      return c.redirect(await conn.begin(callback));
    } catch (e) {
      console.error(e);
      return c.redirect(`/?connect_error=${encodeURIComponent((e as Error).message)}`);
    }
  });

  app.get('/auth/callback', async (c) => {
    if (!conn) return c.redirect('/');
    // Discogs sends ?denied=<token> when the user clicks "Cancel".
    if (c.req.query('denied')) return c.redirect('/?connect_error=' + encodeURIComponent('Connection cancelled on Discogs.'));
    const token = c.req.query('oauth_token');
    const verifier = c.req.query('oauth_verifier');
    if (!token || !verifier) return c.redirect('/?connect_error=' + encodeURIComponent('Discogs did not finish the sign-in.'));
    try {
      await conn.finish(token, verifier);
      return c.redirect('/');
    } catch (e) {
      console.error(e);
      return c.redirect(`/?connect_error=${encodeURIComponent((e as Error).message)}`);
    }
  });

  app.post('/auth/disconnect', (c) => {
    if (!conn) throw new HTTPException(400, { message: 'Nothing to disconnect in demo mode.' });
    conn.disconnect();
    return c.json(conn.status());
  });

  app.get('/me', async (c) => {
    const u = await me();
    const [profile, value] = await Promise.all([api.profile(u), api.collectionValue(u).catch(() => null)]);
    return c.json({ profile, value });
  });

  app.get('/folders', async (c) => c.json(await api.folders(await me())));

  app.get('/collection', async (c) => {
    const folder = Number(c.req.query('folder') ?? 0);
    return c.json({ items: await fetchCollection(api, await me(), folder) });
  });

  app.get('/wants', async (c) => c.json({ items: await fetchWants(api, await me()) }));

  // Add by release id, or by master id (resolved to its main release).
  app.post('/wants', async (c) => {
    const body = await c.req.json<{ releaseId?: number; masterId?: number }>();
    let releaseId = body.releaseId;
    if (!releaseId && body.masterId) releaseId = (await api.master(body.masterId)).main_release;
    if (!releaseId) throw new HTTPException(400, { message: 'releaseId or masterId required' });
    await api.addWant(await me(), releaseId);
    return c.json({ ok: true, releaseId });
  });

  app.delete('/wants/:releaseId', async (c) => {
    await api.removeWant(await me(), Number(c.req.param('releaseId')));
    return c.json({ ok: true });
  });

  app.get('/stats/:releaseId', async (c) =>
    c.json(await api.marketplaceStats(Number(c.req.param('releaseId')), c.req.query('currency'))));

  app.post('/jobs/match', async (c) => {
    const body = await c.req.json<{ sellers: string[]; criteria?: Partial<MatchCriteria>; maxPagesPerSeller?: number }>();
    if (!body.sellers?.length) throw new HTTPException(400, { message: 'Add at least one seller' });
    const u = await me();
    const job = startJob('match', (progress) => runSellerMatch(api, u, {
      sellers: body.sellers.slice(0, 20),
      criteria: { ...DEFAULT_CRITERIA, ...body.criteria },
      maxPagesPerSeller: Math.min(Math.max(1, body.maxPagesPerSeller ?? 10), 100),
    }, progress));
    return c.json({ id: job.id });
  });

  app.post('/jobs/recommend', async (c) => {
    const u = await me();
    const job = startJob('recommend', (progress) =>
      buildRecommendations(api, u, { artists: 6, labels: 3, styles: 4 }, progress));
    return c.json({ id: job.id });
  });

  app.get('/jobs/:id', (c) => {
    const job = getJob(c.req.param('id'));
    if (!job) throw new HTTPException(404, { message: 'Job not found' });
    return c.json(job);
  });

  return app;
}
