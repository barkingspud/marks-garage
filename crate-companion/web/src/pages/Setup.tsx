export function Setup() {
  return (
    <div className="setup card">
      <h1>Connect your Discogs account</h1>
      <ol>
        <li>Go to <a href="https://www.discogs.com/settings/developers" target="_blank" rel="noreferrer">Discogs → Settings → Developers</a> and click <b>Generate new token</b>.</li>
        <li>Put it in a <code>.env</code> file as <code>DISCOGS_TOKEN=…</code> (copy <code>.env.example</code>). Keep that file out of git — e.g. in your OneDrive project folder, and start the app with <code>DISCOGS_ENV_FILE</code> pointing at it.</li>
        <li>Restart <code>npm run dev</code>.</li>
      </ol>
      <p className="muted">Just want to look around? Run <code>npm run mock</code> for demo data.</p>
    </div>
  );
}
