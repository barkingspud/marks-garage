import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { AI_MODELS, modelInfo } from '../../../shared/ai-models';
import type { AiFeature } from '../../../shared/ai-types';
import { ErrorBox } from './ui';

export const SPARKLE = 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z';
export const Sparkle = () => <svg viewBox="0 0 24 24" aria-hidden className="sparkle"><path d={SPARKLE} /></svg>;

export function useAiStatus() {
  return useQuery({ queryKey: ['ai-status'], queryFn: api.ai.status, staleTime: Infinity });
}

/** Shows its children when the AI is set up; otherwise a short note linking to Settings. */
export function AiGate({ children, what }: { children: ReactNode; what: string }) {
  const s = useAiStatus();
  if (s.isLoading) return null;
  if (s.data?.configured) return <>{children}</>;
  return (
    <div className="ai-gate glass">
      <Sparkle />
      <p><b>AI can {what}.</b> <span className="sub">Add your Anthropic API key to turn it on.</span></p>
      <Link to="/settings" className="btn small">Set up AI</Link>
    </div>
  );
}

/** Save, replace or remove the Anthropic API key. */
export function AiKeyForm() {
  const qc = useQueryClient();
  const s = useAiStatus();
  const [key, setKey] = useState('');
  const [editing, setEditing] = useState(false);
  const save = useMutation({
    mutationFn: () => api.ai.setKey(key),
    onSuccess: (d) => { qc.setQueryData(['ai-status'], d); setKey(''); setEditing(false); },
  });
  const remove = useMutation({
    mutationFn: api.ai.removeKey,
    onSuccess: (d) => qc.setQueryData(['ai-status'], d),
  });
  const on = s.data?.configured;

  if (on && !editing) {
    return (
      <div className="ai-key">
        <p><span className="status yes">AI is on</span> <span className="sub small">Using {modelInfo(s.data!.model)?.name ?? s.data!.model}.</span></p>
        <div className="page-actions">
          <button className="btn small" onClick={() => setEditing(true)}>Replace key</button>
          <button className="btn small danger" disabled={remove.isPending}
            onClick={() => { if (confirm('Remove your Anthropic API key from this device? The AI features turn off.')) remove.mutate(); }}>
            Remove key
          </button>
        </div>
        <ErrorBox error={remove.error} />
      </div>
    );
  }
  return (
    <form className="ai-key" onSubmit={(e) => { e.preventDefault(); if (key.trim()) save.mutate(); }}>
      <label className="field">
        Anthropic API key
        <input className="input" type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
      <p className="sub small">
        Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a> (Settings, API keys).
        It's checked with Anthropic, then kept only on this device.
      </p>
      <div className="page-actions">
        <button type="submit" className="btn primary" disabled={!key.trim() || save.isPending}>{save.isPending ? 'Checking the key…' : 'Save key'}</button>
        {editing && <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>}
      </div>
      <ErrorBox error={save.error} />
    </form>
  );
}

/** Pick the model the AI features use. */
export function ModelPicker() {
  const qc = useQueryClient();
  const s = useAiStatus();
  const set = useMutation({
    mutationFn: api.ai.setModel,
    onSuccess: (d) => qc.setQueryData(['ai-status'], d),
  });
  const current = s.data?.model;
  return (
    <fieldset className="model-picker">
      <legend>Model</legend>
      {AI_MODELS.map((m) => (
        <label key={m.id} className={`model-option glass${current === m.id ? ' on' : ''}`}>
          <input type="radio" name="ai-model" value={m.id} checked={current === m.id} disabled={set.isPending}
            onChange={() => set.mutate(m.id)} />
          <span>
            <b>{m.name}</b> <span className="sub small">{m.perUse}</span>
            <span className="sub small model-blurb">{m.blurb}</span>
          </span>
        </label>
      ))}
      <ErrorBox error={set.error} />
    </fieldset>
  );
}

const FEATURE_NAMES: Record<AiFeature, string> = {
  identify: 'Identify from photos',
  recommend: 'Recommendations',
  review: 'Listing reviews',
  notes: 'Album notes',
  tonight: 'Tonight’s picks',
};

/** Dollars, with fractions of a cent for small amounts. */
export function cost(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return `${(n * 100).toFixed(2)}¢`;
  if (n < 1) return `${(n * 100).toFixed(1)}¢`;
  return `$${n.toFixed(2)}`;
}

/** What the AI has cost on this device, overall and per use, by feature and model. */
export function CostMeter() {
  const qc = useQueryClient();
  const usage = useQuery({ queryKey: ['ai-usage'], queryFn: api.ai.usage });
  const clear = useMutation({
    mutationFn: api.ai.clearUsage,
    onSuccess: (d) => qc.setQueryData(['ai-usage'], d),
  });
  const u = usage.data;
  if (usage.error) return <ErrorBox error={usage.error} />;
  if (!u) return null;
  const uses = (n: number) => `${n} ${n === 1 ? 'use' : 'uses'}`;
  return (
    <div className="cost-meter">
      <div className="cost-totals">
        <div><span className="sub small">This month</span><b>{cost(u.thisMonth.cost)}</b><span className="sub small">{uses(u.thisMonth.uses)}</span></div>
        <div><span className="sub small">All time</span><b>{cost(u.total.cost)}</b><span className="sub small">{uses(u.total.uses)}</span></div>
      </div>
      {u.groups.length > 0 ? (
        <table className="cost-table">
          <thead><tr><th>Feature</th><th>Model</th><th>Uses</th><th>Per use</th></tr></thead>
          <tbody>
            {u.groups.map((g) => (
              <tr key={`${g.feature}-${g.model}`}>
                <td>{FEATURE_NAMES[g.feature] ?? g.feature}</td>
                <td>{modelInfo(g.model)?.name ?? g.model}</td>
                <td>{g.uses}</td>
                <td>{cost(g.cost / g.uses)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sub small">Nothing yet. Each use of an AI feature shows up here with what it cost.</p>
      )}
      <p className="sub small">
        Worked out from the tokens Anthropic reports and its list prices, so it may differ slightly from your bill.
        Your actual charges are on the Usage page at console.anthropic.com.
      </p>
      {u.total.uses > 0 && (
        <button className="btn small" disabled={clear.isPending}
          onClick={() => { if (confirm('Clear the cost history on this device?')) clear.mutate(); }}>
          Clear history
        </button>
      )}
    </div>
  );
}
