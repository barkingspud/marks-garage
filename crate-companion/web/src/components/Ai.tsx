import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
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
        <p><span className="status yes">AI is on</span> <span className="sub small">Using {s.data!.model}.</span></p>
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
