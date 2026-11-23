import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp, publicOrigin } from '../app';
import { MockDiscogs } from '../discogs/mock';
import { authorizationHeader, type DiscogsAuth } from '../discogs/client';
import { DiscogsConnection } from './connection';
import { oauthHeader } from './oauth';
import { ConnectionStore } from './store';

const consumer = { key: 'ck', secret: 'cs&x' };

describe('oauthHeader', () => {
  it('builds a PLAINTEXT header', () => {
    const h = oauthHeader(consumer, { token: 'at', secret: 'as' }, {}, 1_700_000_000_000, 'n1');
    expect(h).toBe(
      'OAuth oauth_consumer_key="ck", oauth_nonce="n1", oauth_signature_method="PLAINTEXT", '
      + 'oauth_timestamp="1700000000", oauth_version="1.0", oauth_token="at", oauth_signature="cs%26x&as"',
    );
  });
  it('signs with an empty token secret before a token exists, and encodes the callback', () => {
    const h = oauthHeader(consumer, undefined, { oauth_callback: 'http://localhost:5173/api/auth/callback' }, 0, 'n');
    expect(h).toContain('oauth_signature="cs%26x&"');
    expect(h).toContain('oauth_callback="http%3A%2F%2Flocalhost%3A5173%2Fapi%2Fauth%2Fcallback"');
    expect(h).not.toContain('oauth_token=');
  });
  it('personal tokens keep the Discogs token header', () => {
    expect(authorizationHeader({ kind: 'token', token: 't' })).toBe('Discogs token=t');
  });
});

/** Fake discogs.com token endpoints, recording what was sent. */
function fakeDiscogs() {
  const calls: { url: string; method: string; auth: string }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const auth = (init.headers as Record<string, string>).Authorization ?? '';
    calls.push({ url, method: init.method!, auth });
    if (url.endsWith('/oauth/request_token')) {
      return new Response('oauth_token=req1&oauth_token_secret=reqsecret&oauth_callback_confirmed=true');
    }
    if (url.endsWith('/oauth/access_token')) {
      return auth.includes('oauth_verifier="v1"') && auth.includes('oauth_signature="cs%26x&reqsecret"')
        ? new Response('oauth_token=acc1&oauth_token_secret=accsecret')
        : new Response('bad verifier', { status: 401 });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

function setup(personalToken?: string) {
  const store = new ConnectionStore(join(mkdtempSync(join(tmpdir(), 'cc-')), 'conn.json'));
  const applied: (DiscogsAuth | undefined)[] = [];
  const { f, calls } = fakeDiscogs();
  const conn = new DiscogsConnection({
    consumer, personalToken, personalUsername: personalToken ? 'tokenuser' : undefined, userAgent: 'test',
    store, fetch: f,
    apply: (a) => applied.push(a),
    identify: async (a) => (a.kind === 'oauth' && a.access.token === 'acc1' ? 'barkingspud' : 'someone'),
  });
  return { store, applied, calls, conn };
}

describe('DiscogsConnection', () => {
  it('runs the full connect flow, saves it, and survives a restart', async () => {
    const { store, applied, calls, conn } = setup();
    expect(conn.status()).toEqual({ method: null, username: null, canConnect: true });

    const url = await conn.begin('http://localhost:5173/api/auth/callback');
    expect(url).toBe('https://www.discogs.com/oauth/authorize?oauth_token=req1');
    expect(calls[0]!.method).toBe('GET');

    expect(await conn.finish('req1', 'v1')).toBe('barkingspud');
    expect(calls[1]!.method).toBe('POST');
    expect(conn.status()).toMatchObject({ method: 'oauth', username: 'barkingspud' });
    expect(applied.at(-1)).toMatchObject({ kind: 'oauth', access: { token: 'acc1', secret: 'accsecret' } });
    expect(store.load()).toMatchObject({ token: 'acc1', secret: 'accsecret', username: 'barkingspud' });

    // A new server process picks the saved connection up again.
    const again = new DiscogsConnection({
      consumer, userAgent: 't', store, apply: () => {}, identify: async () => 'x',
    });
    expect(again.status()).toMatchObject({ method: 'oauth', username: 'barkingspud' });
  });

  it('rejects unknown or reused request tokens', async () => {
    const { conn } = setup();
    await conn.begin('http://x/cb');
    await expect(conn.finish('nope', 'v1')).rejects.toThrow(/expired/);
    await conn.finish('req1', 'v1');
    await expect(conn.finish('req1', 'v1')).rejects.toThrow(/expired/);
  });

  it('prefers the connected account over the .env token and falls back on disconnect', async () => {
    const { store, conn } = setup('pt');
    expect(conn.status().method).toBe('token');
    await conn.begin('http://x/cb');
    await conn.finish('req1', 'v1');
    expect(conn.status().method).toBe('oauth');
    conn.disconnect();
    expect(store.load()).toBeUndefined();
    expect(conn.status()).toMatchObject({ method: 'token', username: 'tokenuser' });
  });
});

describe('auth routes', () => {
  it('redirects to Discogs, handles the callback, and disconnects', async () => {
    const { conn } = setup();
    const app = createApp(new MockDiscogs() as never, { connection: conn });

    const start = await app.request('http://localhost:5173/api/auth/connect');
    expect(start.status).toBe(302);
    expect(start.headers.get('location')).toBe('https://www.discogs.com/oauth/authorize?oauth_token=req1');

    const cancelled = await app.request('http://localhost:5173/api/auth/callback?denied=req1');
    expect(cancelled.headers.get('location')).toMatch(/^\/\?connect_error=Connection%20cancelled/);

    const back = await app.request('http://localhost:5173/api/auth/callback?oauth_token=req1&oauth_verifier=v1');
    expect(back.headers.get('location')).toBe('/');
    expect(conn.status().method).toBe('oauth');

    const off = await app.request('http://localhost:5173/api/auth/disconnect', { method: 'POST' });
    expect(await off.json()).toMatchObject({ method: null });
  });
});

describe('publicOrigin', () => {
  it('uses the web app address passed on by the dev proxy', () => {
    expect(publicOrigin('http://localhost:8787/api/auth/connect', 'localhost:5173', 'http')).toBe('http://localhost:5173');
    expect(publicOrigin('http://localhost:8787/api/auth/connect')).toBe('http://localhost:8787');
  });
});
