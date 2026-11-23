import type { DiscogsAuth } from '../discogs/client';
import { authorizeUrl, getAccessToken, getRequestToken, PendingRequests, type Consumer } from './oauth';
import { ConnectionStore, type KeyValueStore } from './store';

export type ConnectionMethod = 'oauth' | 'token' | null;

export interface ConnectionStatus {
  method: ConnectionMethod;
  username: string | null;
  /** True when the app is registered with Discogs (consumer key + secret set), so the button can work. */
  canConnect: boolean;
}

interface Options {
  consumer?: Consumer;
  /** A personal token from configuration (.env on a PC). */
  personalToken?: string;
  personalUsername?: string;
  userAgent: string;
  store: KeyValueStore;
  /** Applies the chosen credentials to the Discogs client (and clears its cache). */
  apply: (auth: DiscogsAuth | undefined) => void;
  /** Looks up who a set of credentials belongs to. */
  identify: (auth: DiscogsAuth) => Promise<string>;
  fetch?: typeof fetch;
}

const TOKEN_KEY = 'discogs-personal-token';

/**
 * Decides which Discogs credentials to use:
 *   1. an account connected with "Connect with Discogs" (saved in the store), else
 *   2. a personal token saved in the app, else
 *   3. a personal token from configuration (DISCOGS_TOKEN), else nothing.
 * Create it with DiscogsConnection.create(), which loads what was saved.
 */
export class DiscogsConnection {
  private pending: PendingRequests;
  private saved: ConnectionStore;
  private method: ConnectionMethod = null;
  private username: string | null = null;
  private savedToken: string | null = null;

  private constructor(private o: Options) {
    this.pending = new PendingRequests(o.store);
    this.saved = new ConnectionStore(o.store);
  }

  static async create(o: Options): Promise<DiscogsConnection> {
    const c = new DiscogsConnection(o);
    await c.restore();
    return c;
  }

  private async restore() {
    const saved = this.o.consumer ? await this.saved.load() : undefined;
    this.savedToken = await this.o.store.get(TOKEN_KEY);
    if (saved && this.o.consumer) {
      this.use('oauth', { kind: 'oauth', consumer: this.o.consumer, access: saved }, saved.username);
    } else {
      this.useToken();
    }
  }

  private use(method: ConnectionMethod, auth: DiscogsAuth | undefined, username: string | null) {
    this.method = method;
    this.username = username;
    this.o.apply(auth);
  }

  private useToken() {
    const token = this.savedToken ?? this.o.personalToken;
    if (token) {
      this.use('token', { kind: 'token', token }, this.savedToken ? null : this.o.personalUsername ?? null);
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
    await this.pending.add(req);
    return authorizeUrl(req.token);
  }

  /** Step 2: the user is back from discogs.com; swap the request token for an access token. */
  async finish(requestToken: string, verifier: string): Promise<string> {
    if (!this.o.consumer) throw new Error('App is not registered with Discogs.');
    const req = await this.pending.take(requestToken);
    if (!req) throw new Error('This sign-in link has expired or was already used. Please try connecting again.');
    const access = await getAccessToken(this.o.consumer, req, verifier, this.o.userAgent, this.o.fetch);
    const auth: DiscogsAuth = { kind: 'oauth', consumer: this.o.consumer, access };
    const username = await this.o.identify(auth);
    await this.saved.save({ ...access, username, connectedAt: new Date().toISOString() });
    this.use('oauth', auth, username);
    return username;
  }

  /** Use a personal token entered in the app. Checks it with Discogs before saving. */
  async useTokenFromUser(token: string): Promise<string> {
    const t = token.trim();
    const username = await this.o.identify({ kind: 'token', token: t });
    await this.o.store.set(TOKEN_KEY, t);
    this.savedToken = t;
    this.use('token', { kind: 'token', token: t }, username);
    return username;
  }

  /** Forget the connected account and any token saved in the app. Falls back to a configured token. */
  async disconnect() {
    await this.saved.clear();
    await this.o.store.remove(TOKEN_KEY);
    this.savedToken = null;
    this.useToken();
  }
}
