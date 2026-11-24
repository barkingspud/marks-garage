import { useQuery } from '@tanstack/react-query';
import { api, mode } from '../api';
import { AiKeyForm, CostMeter, IncludedAi, ModelPicker, Sparkle, useAiStatus } from '../components/Ai';
import { DisconnectButton } from '../components/Disconnect';
import { PageHeader } from '../components/ui';
import { useRoom } from '../room';
import { forgetJobResults } from '../useJob';

export function Settings() {
  const status = useQuery({ queryKey: ['status'], queryFn: api.status });
  useRoom(null, 220);
  const s = status.data;
  const ai = useAiStatus();
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
          read notes on an album, and get picks for tonight. It uses Claude, from Anthropic.
        </p>
        {ai.data?.included && <IncludedAi />}
        {ai.data?.ownKey ? (
          <>
            <AiKeyForm />
            <ModelPicker />
          </>
        ) : ai.data?.included ? (
          <details className="ai-details">
            <summary>Use your own Anthropic key (optional)</summary>
            <p className="sub small" style={{ marginBottom: 12 }}>
              No monthly limit, and you can choose a bigger model such as Opus. Anthropic bills your account for each use.
            </p>
            <AiKeyForm />
          </details>
        ) : (
          <AiKeyForm />
        )}
        <details className="ai-details">
          <summary>Cost and privacy</summary>
          <p className="sub small">
            {ai.data?.included ? 'The included AI is free to use up to its monthly limit. ' : ''}
            With your own key, Anthropic bills your account for each use: under 1¢ a use with Haiku,
            and roughly 5 to 20¢ with Opus.
            When you use a feature, the app sends what that feature needs (the photo, your album list, or the listings
            being reviewed){ai.data?.included ? ' through the Crate Companion AI server' : ''} to Anthropic.
            Nothing is sent until you tap an AI button, and nothing is kept on the server but a count of uses.
          </p>
        </details>
      </section>

      {ai.data?.ownKey && (
        <section className="glass panel" aria-labelledby="h-cost">
          <h2 id="h-cost">AI costs</h2>
          <CostMeter />
        </section>
      )}
    </div>
  );
}
