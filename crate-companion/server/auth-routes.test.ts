import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { setup } from '../core/auth/test-helpers';
import { CrateCore } from '../core/crate';
import { MockDiscogs } from '../core/discogs/mock';
import { createApp, publicOrigin } from './app';
import { FileStore } from './file-store';

describe('auth routes', () => {
  it('redirects to Discogs, handles the callback, and disconnects', async () => {
    const { conn } = await setup();
    const app = createApp(CrateCore.fromApi(new MockDiscogs(), conn));

    const start = await app.request('http://localhost:5173/api/auth/connect');
    expect(start.status).toBe(302);
    expect(start.headers.get('location')).toBe('https://www.discogs.com/oauth/authorize?oauth_token=req1');

    const canceled = await app.request('http://localhost:5173/api/auth/callback?denied=req1');
    expect(canceled.headers.get('location')).toMatch(/^\/\?connect_error=Connection%20canceled/);

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

describe('FileStore', () => {
  it('reads a sign-in saved by the previous version', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'cc-')), 'conn.json');
    writeFileSync(file, JSON.stringify({ token: 't', secret: 's', username: 'barkingspud', connectedAt: 'x' }));
    const store = new FileStore(file);
    expect(JSON.parse((await store.get('discogs-connection'))!)).toMatchObject({ username: 'barkingspud' });
    await store.set('other', 'v');
    expect(await store.get('other')).toBe('v');
    expect(await store.get('discogs-connection')).not.toBeNull();
  });
});
