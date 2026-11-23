import { DiscogsConnection } from './connection';
import type { DiscogsAuth } from '../discogs/client';
import { ConnectionStore, MemoryStore } from './store';

export const consumer = { key: 'ck', secret: 'cs&x' };

/** Fake discogs.com token endpoints, recording what was sent. */
export function fakeDiscogs() {
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

export async function setup(personalToken?: string) {
  const kv = new MemoryStore();
  const applied: (DiscogsAuth | undefined)[] = [];
  const { f, calls } = fakeDiscogs();
  const identify = async (a: DiscogsAuth) =>
    a.kind === 'oauth' && a.access.token === 'acc1' ? 'barkingspud' : a.kind === 'token' && a.token === 'good' ? 'tokenperson' : Promise.reject(new Error('Discogs 401'));
  const conn = await DiscogsConnection.create({
    consumer, personalToken, personalUsername: personalToken ? 'tokenuser' : undefined, userAgent: 'test',
    store: kv, fetch: f, apply: (a) => applied.push(a), identify,
  });
  return { kv, saved: new ConnectionStore(kv), applied, calls, conn, identify };
}

