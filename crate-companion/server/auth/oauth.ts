import { randomBytes } from 'node:crypto';

/**
 * Discogs OAuth 1.0a ("Connect with Discogs"), using the PLAINTEXT signature method,
 * which Discogs supports over HTTPS. Flow:
 *   1. getRequestToken(callback)        -> temporary token + secret
 *   2. send the user to authorizeUrl()  -> they approve on discogs.com
 *   3. Discogs redirects to callback with oauth_token + oauth_verifier
 *   4. getAccessToken(...)              -> permanent token + secret for API calls
 * Reference: https://www.discogs.com/developers#page:authentication,header:authentication-oauth-flow
 */

const API = 'https://api.discogs.com';
export const AUTHORIZE_URL = 'https://www.discogs.com/oauth/authorize';

export interface Consumer { key: string; secret: string }
export interface TokenPair { token: string; secret: string }

type Fetch = typeof fetch;

function enc(s: string) {
  return encodeURIComponent(s);
}

/** Authorization header value for an OAuth 1.0a PLAINTEXT request. */
export function oauthHeader(
  consumer: Consumer,
  token?: TokenPair,
  extra: Record<string, string> = {},
  now = Date.now(),
  nonce = randomBytes(16).toString('hex'),
): string {
  const params: Record<string, string> = {
    oauth_consumer_key: consumer.key,
    oauth_nonce: nonce,
    oauth_signature_method: 'PLAINTEXT',
    oauth_timestamp: String(Math.floor(now / 1000)),
    oauth_version: '1.0',
    ...(token ? { oauth_token: token.token } : {}),
    ...extra,
    // PLAINTEXT signature: consumer secret & token secret (empty before we have a token).
    oauth_signature: `${enc(consumer.secret)}&${enc(token?.secret ?? '')}`,
  };
  return 'OAuth ' + Object.entries(params).map(([k, v]) => `${k}="${k === 'oauth_signature' ? v : enc(v)}"`).join(', ');
}

async function tokenRequest(
  f: Fetch, method: 'GET' | 'POST', path: string, userAgent: string, authorization: string,
): Promise<URLSearchParams> {
  const res = await f(API + path, {
    method,
    headers: {
      'User-Agent': userAgent,
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: authorization,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Discogs ${res.status} on ${path}: ${text.slice(0, 200)}`);
  return new URLSearchParams(text);
}

export async function getRequestToken(
  consumer: Consumer, callbackUrl: string, userAgent: string, f: Fetch = fetch,
): Promise<TokenPair> {
  const q = await tokenRequest(f, 'GET', '/oauth/request_token', userAgent,
    oauthHeader(consumer, undefined, { oauth_callback: callbackUrl }));
  const token = q.get('oauth_token');
  const secret = q.get('oauth_token_secret');
  if (!token || !secret) throw new Error('Discogs did not return a request token');
  return { token, secret };
}

export function authorizeUrl(requestToken: string): string {
  return `${AUTHORIZE_URL}?oauth_token=${enc(requestToken)}`;
}

export async function getAccessToken(
  consumer: Consumer, request: TokenPair, verifier: string, userAgent: string, f: Fetch = fetch,
): Promise<TokenPair> {
  const q = await tokenRequest(f, 'POST', '/oauth/access_token', userAgent,
    oauthHeader(consumer, request, { oauth_verifier: verifier }));
  const token = q.get('oauth_token');
  const secret = q.get('oauth_token_secret');
  if (!token || !secret) throw new Error('Discogs did not return an access token');
  return { token, secret };
}

/** Request tokens waiting for the user to come back from discogs.com (in memory, 15 min). */
export class PendingRequests {
  private map = new Map<string, { secret: string; expires: number }>();
  constructor(private ttlMs = 15 * 60_000) {}
  add(t: TokenPair) {
    const now = Date.now();
    for (const [k, v] of this.map) if (v.expires < now) this.map.delete(k);
    this.map.set(t.token, { secret: t.secret, expires: now + this.ttlMs });
  }
  /** Returns and forgets the pending request, or undefined if unknown/expired. */
  take(token: string): TokenPair | undefined {
    const hit = this.map.get(token);
    this.map.delete(token);
    return hit && hit.expires >= Date.now() ? { token, secret: hit.secret } : undefined;
  }
}
