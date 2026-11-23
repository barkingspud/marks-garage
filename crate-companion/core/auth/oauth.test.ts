import { describe, expect, it } from 'vitest';
import { authorizationHeader } from '../discogs/client';
import { DiscogsConnection } from './connection';
import { oauthHeader } from './oauth';
import { consumer, fakeDiscogs, setup } from './test-helpers';


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

describe('DiscogsConnection', () => {
  it('runs the full connect flow, saves it, and survives a restart', async () => {
    const { kv, saved, applied, calls, conn } = await setup();
    expect(conn.status()).toEqual({ method: null, username: null, canConnect: true });

    const url = await conn.begin('http://localhost:5173/api/auth/callback');
    expect(url).toBe('https://www.discogs.com/oauth/authorize?oauth_token=req1');
    expect(calls[0]!.method).toBe('GET');

    expect(await conn.finish('req1', 'v1')).toBe('barkingspud');
    expect(calls[1]!.method).toBe('POST');
    expect(conn.status()).toMatchObject({ method: 'oauth', username: 'barkingspud' });
    expect(applied.at(-1)).toMatchObject({ kind: 'oauth', access: { token: 'acc1', secret: 'accsecret' } });
    expect(await saved.load()).toMatchObject({ token: 'acc1', secret: 'accsecret', username: 'barkingspud' });

    // A restart picks the saved connection up again.
    const again = await DiscogsConnection.create({ consumer, userAgent: 't', store: kv, apply: () => {}, identify: async () => 'x' });
    expect(again.status()).toMatchObject({ method: 'oauth', username: 'barkingspud' });
  });

  it('remembers a pending sign-in across a restart (the app reloads while on discogs.com)', async () => {
    const { kv, conn } = await setup();
    await conn.begin('http://x/cb');
    const { f } = fakeDiscogs();
    const reloaded = await DiscogsConnection.create({ consumer, userAgent: 't', store: kv, fetch: f, apply: () => {}, identify: async () => 'barkingspud' });
    expect(await reloaded.finish('req1', 'v1')).toBe('barkingspud');
  });

  it('rejects unknown or reused request tokens', async () => {
    const { conn } = await setup();
    await conn.begin('http://x/cb');
    await expect(conn.finish('nope', 'v1')).rejects.toThrow(/expired/);
    await conn.finish('req1', 'v1');
    await expect(conn.finish('req1', 'v1')).rejects.toThrow(/expired/);
  });

  it('prefers the connected account over the .env token and falls back on disconnect', async () => {
    const { saved, conn } = await setup('pt');
    expect(conn.status().method).toBe('token');
    await conn.begin('http://x/cb');
    await conn.finish('req1', 'v1');
    expect(conn.status().method).toBe('oauth');
    await conn.disconnect();
    expect(await saved.load()).toBeUndefined();
    expect(conn.status()).toMatchObject({ method: 'token', username: 'tokenuser' });
  });

  it('checks and saves a personal token entered in the app', async () => {
    const { kv, conn } = await setup();
    await expect(conn.useTokenFromUser('bad')).rejects.toThrow();
    expect(conn.connected).toBe(false);
    expect(await conn.useTokenFromUser(' good ')).toBe('tokenperson');
    expect(conn.status()).toMatchObject({ method: 'token', username: 'tokenperson' });
    const again = await DiscogsConnection.create({ consumer, userAgent: 't', store: kv, apply: () => {}, identify: async () => 'x' });
    expect(again.status().method).toBe('token');
    await again.disconnect();
    expect(again.connected).toBe(false);
  });
});
