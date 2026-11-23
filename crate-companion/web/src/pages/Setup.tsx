import { CONNECT_URL, type Status } from '../api';

/** Shown when no Discogs account is connected. */
export function Setup({ status }: { status: Status }) {
  const error = new URLSearchParams(window.location.search).get('connect_error');
  const canConnect = !!status.auth?.canConnect;

  return (
    <div className="setup card">
      <div className="setup-brand"><img src="/icon.svg" alt="" width={32} height={32} /> Crate Companion</div>
      <h1>Connect your Discogs account</h1>
      {error && <div className="error">{error}</div>}

      {canConnect ? (
        <>
          <p>
            You'll be taken to Discogs to sign in and approve access. Crate Companion never sees
            your Discogs password, and you can remove its access at any time in your Discogs settings.
          </p>
          <a className="button primary big" href={CONNECT_URL}>Connect with Discogs</a>
          <p className="muted small">
            Crate Companion can read your collection and wantlist, and add or remove wantlist items
            when you ask it to.
          </p>
        </>
      ) : (
        <>
          <p>
            The app isn't registered with Discogs yet, so the <b>Connect with Discogs</b> button
            can't work. This is a one-time setup:
          </p>
          <ol>
            <li>
              Go to <a href="https://www.discogs.com/settings/developers" target="_blank" rel="noreferrer">Discogs → Settings → Developers</a> and
              click <b>Create an Application</b>. Any name and description will do.
            </li>
            <li>Copy its <b>Consumer Key</b> and <b>Consumer Secret</b> into the <code>.env</code> file as <code>DISCOGS_CONSUMER_KEY=…</code> and <code>DISCOGS_CONSUMER_SECRET=…</code>.</li>
            <li>Restart the app (<b>Ctrl + C</b>, then <code>npm run dev</code>) and reload this page.</li>
          </ol>
          <p className="muted small">
            Alternatively, put a personal token from the same page in <code>.env</code> as <code>DISCOGS_TOKEN=…</code>.
            Just want to look around? Run <code>npm run mock</code> for demo data.
          </p>
        </>
      )}
    </div>
  );
}
