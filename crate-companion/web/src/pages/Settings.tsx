import { useQuery } from '@tanstack/react-query';
import { api, mode } from '../api';
import { AiKeyForm, Sparkle } from '../components/Ai';
import { DisconnectButton } from '../components/Disconnect';
import { PageHeader } from '../components/ui';
import { useRoom } from '../room';
import { forgetJobResults } from '../useJob';

export function Settings() {
  const status = useQuery({ queryKey: ['status'], queryFn: api.status });
  useRoom(null, 220);
  const s = status.data;
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageHeader title="Settings" />

      <section className="glass panel" aria-labelledby="h-discogs">
        <h2 id="h-discogs">Discogs account</h2>
        {s?.mock ? (
          <>
            <p className="sub">You're looking at demo data.</p>
            {mode === 'local' && <button className="btn small" style={{ marginTop: 10 }} onClick={() => { forgetJobResults(); api.setDemo(false); }}>Leave demo</button>}
          </>
        ) : (
          <>
            <p className="sub">{s?.username ? <>Signed in as <b>{s.username}</b>{s.auth?.method === 'token' ? ' with a personal token' : ''}.</> : 'Not signed in.'}</p>
            {(s?.auth?.method === 'oauth' || (mode === 'local' && s?.auth?.method)) && <div style={{ marginTop: 10 }}><DisconnectButton /></div>}
          </>
        )}
      </section>

      <section className="glass panel" aria-labelledby="h-ai">
        <h2 id="h-ai" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Sparkle />AI assistant</h2>
        <p className="sub" style={{ marginBottom: 14 }}>
          Identify pressings from photos, ask for recommendations in your own words, have seller listings reviewed,
          read notes on an album, and get picks for tonight. It uses Claude, from Anthropic, with your own API key.
        </p>
        <AiKeyForm />
        <details className="ai-details">
          <summary>Cost and privacy</summary>
          <p className="sub small">
            Anthropic bills your account for each use, roughly 5 to 20¢: album notes or tonight's picks about 5¢,
            identifying a photo or reviewing listings about 10¢, and a set of recommendations 10 to 20¢. When you use a feature, the app sends Anthropic what that feature needs: the photo,
            your album list, or the listings being reviewed. Nothing is sent until you tap an AI button.
          </p>
        </details>
      </section>
    </div>
  );
}
