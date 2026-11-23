import { CONNECT_URL, type Status } from '../api';

/** Shown when no Discogs account is connected. */
export function Setup({ status }: { status: Status }) {
  const error = new URLSearchParams(window.location.search).get('connect_error');
  const canConnect = !!status.auth?.canConnect;
  return (
    <div className="room">
      <main className="main">
        <div className="connect glass">
          <span className="brand"><span className="brand-disc" aria-hidden /> Crate Companion</span>
          <h1>Connect your Discogs account</h1>
          {error && <div className="error" role="alert">{error}</div>}
          {canConnect ? (
            <>
              <p className="sub">You'll sign in on Discogs and approve access. Crate Companion never sees your password, and you can remove its access at any time in your Discogs settings.</p>
              <a className="btn primary" href={CONNECT_URL}>Connect with Discogs</a>
              <p className="sub small">It can read your collection and wantlist, and add or remove records when you ask it to.</p>
            </>
          ) : (
            <>
              <p className="sub">The app isn't registered with Discogs yet, so the Connect button can't work. One-time setup:</p>
              <ol>
                <li>Go to <a href="https://www.discogs.com/settings/developers" target="_blank" rel="noreferrer">Discogs, Settings, Developers</a> and click <b>Create an Application</b>.</li>
                <li>Copy its Consumer Key and Consumer Secret into <code>.env</code> as <code>DISCOGS_CONSUMER_KEY</code> and <code>DISCOGS_CONSUMER_SECRET</code>.</li>
                <li>Restart the app and reload this page.</li>
              </ol>
              <p className="sub small">Or put a personal token from the same page in <code>.env</code> as <code>DISCOGS_TOKEN</code>. Just looking around? Run <code>npm run mock</code>.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
