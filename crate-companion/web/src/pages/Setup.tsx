import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, mode, type Status } from '../api';

/** Shown when no Discogs account is connected. */
export function Setup({ status, error: startError }: { status: Status; error?: string | null }) {
  const qc = useQueryClient();
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const urlError = new URLSearchParams(window.location.search).get('connect_error');
  const canConnect = !!status.auth?.canConnect;
  const connect = useMutation({ mutationFn: api.connect });
  const saveToken = useMutation({
    mutationFn: () => api.useToken(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['status'] }),
  });
  const error = startError ?? urlError ?? (connect.error as Error | null)?.message ?? (saveToken.error as Error | null)?.message;

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
              <button className="btn primary" disabled={connect.isPending} onClick={() => connect.mutate()}>
                {connect.isPending ? 'Opening Discogs…' : 'Connect with Discogs'}
              </button>
              <p className="sub small">It can read your collection and wantlist, and add or remove records when you ask it to.</p>
            </>
          ) : mode === 'server' ? (
            <>
              <p className="sub">The app isn't registered with Discogs yet, so the Connect button can't work. One-time setup:</p>
              <ol>
                <li>Go to <a href="https://www.discogs.com/settings/developers" target="_blank" rel="noreferrer">Discogs, Settings, Developers</a> and click <b>Create an Application</b>.</li>
                <li>Copy its Consumer Key and Consumer Secret into <code>.env</code> as <code>DISCOGS_CONSUMER_KEY</code> and <code>DISCOGS_CONSUMER_SECRET</code>.</li>
                <li>Restart the app and reload this page.</li>
              </ol>
            </>
          ) : (
            <p className="sub">Sign in with a personal access token from your Discogs account.</p>
          )}

          {(showToken || !canConnect) ? (
            <form style={{ display: 'flex', flexDirection: 'column', gap: 10 }} onSubmit={(e) => { e.preventDefault(); saveToken.mutate(); }}>
              <label className="field">
                Personal access token
                <input className="input" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste your token" />
              </label>
              <p className="sub small">Get one on Discogs under <a href="https://www.discogs.com/settings/developers" target="_blank" rel="noreferrer">Settings, Developers</a>, then Generate new token. It's kept only on this device.</p>
              <button className="btn" type="submit" disabled={!token.trim() || saveToken.isPending}>{saveToken.isPending ? 'Checking…' : 'Use this token'}</button>
            </form>
          ) : (
            <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setShowToken(true)}>Use a personal token instead</button>
          )}

          {mode === 'local' && (
            <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => api.setDemo(true)}>Look around with demo data</button>
          )}
        </div>
      </main>
    </div>
  );
}
