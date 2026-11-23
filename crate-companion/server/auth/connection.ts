import type { DiscogsAuth } from '../discogs/client';
import { authorizeUrl, getAccessToken, getRequestToken, PendingRequests, type Consumer } from './oauth';
import type { ConnectionStore } from './store';

export type ConnectionMethod = 'oauth' | 'token' | null;

export interface ConnectionStatus {
  method: ConnectionMethod;
  username: string | null;
  /** True when the app is registered with Discogs (consumer key + secret set), so the button can work. */
  canConnect: boolean;
}

interface Options {
  consumer?: Consumer;
  personalToken?: string;
  personalUsername?: string;
  userAgent: string;
  store: ConnectionStore;
  /** Applies the chosen credentials to the Discogs client (and clears its cache). */
  apply: (auth: DiscogsAuth | undefined) => void;
  /** Looks up who a set of credentials belongs to. */
  identify: (auth: DiscogsAuth) => Promise<string>;
  fetch?: typeof fetch;
}

/**
 * Decides which Discogs credentials the server uses:
 *   1. an account connected with "Connect with Discogs" (saved to disk), else
 *   2. the personal token from .env (DISCOGS_TOKEN), else nothing.
 */
export class DiscogsConnection {
  private pending = new PendingRequests();
  private method: ConnectionMethod = null;
  private username: string | null = null;

  constructor(private o: Options) {
    const saved = o.consumer ? o.store.load() : undefined;
    if (saved && o.consumer) {
      this.use('oauth', { kind: 'oauth', consumer: o.consumer, access: saved }, saved.username);
    } else {
      this.usePersonalToken();
    }
  }

  private use(method: ConnectionMethod, auth: DiscogsAuth | undefined, username: string | null) {
    this.method = method;
    this.username = username;
    this.o.apply(auth);
  }

  private usePersonalToken() {
    if (this.o.personalToken) {
      this.use('token', { kind: 'token', token: this.o.personalToken }, this.o.personalUsername ?? null);
    } else {
      this.use(null, undefined, null);
    }
  }

  get connected() {
    return this.method !== null;
  }

  status(): ConnectionStatus {
    return { method: this.method, username: this.username, canConnect: !!this.o.consumer };
  }

  /** The connected username, looked up from Discogs the first time if not known. */
  async currentUsername(lookup: () => Promise<string>): Promise<string> {
    this.username ??= await lookup();
    return this.username;
  }

  /** Step 1: returns the discogs.com URL to send the user to. */
  async begin(callbackUrl: string): Promise<string> {
    if (!this.o.consumer) throw new Error('App is not registered with Discogs: set DISCOGS_CONSUMER_KEY and DISCOGS_CONSUMER_SECRET.');
    const req = await getRequestToken(this.o.consumer, callbackUrl, this.o.userAgent, this.o.fetch);
    this.pending.add(req);
    return authorizeUrl(req.token);
  }

  /** Step 2: the user is back from discogs.com; swap the request token for an access token. */
  async finish(requestToken: string, verifier: string): Promise<string> {
    if (!this.o.consumer) throw new Error('App is not registered with Discogs.');
    const req = this.pending.take(requestToken);
    if (!req) throw new Error('This sign-in link has expired or was already used. Please try connecting again.');
    const access = await getAccessToken(this.o.consumer, req, verifier, this.o.userAgent, this.o.fetch);
    const auth: DiscogsAuth = { kind: 'oauth', consumer: this.o.consumer, access };
    const username = await this.o.identify(auth);
    this.o.store.save({ ...access, username, connectedAt: new Date().toISOString() });
    this.use('oauth', auth, username);
    return username;
  }

  /** Forget the connected account. Falls back to the .env token if there is one. */
  disconnect() {
    this.o.store.clear();
    this.usePersonalToken();
  }
}
