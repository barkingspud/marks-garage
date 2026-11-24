// Must come first: sets up the Android bridge before the API module reads it.
import './native/capacitor';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { api, mode } from './api';
import { Layout } from './components/Layout';
import { ErrorBox, Loading } from './components/ui';
import { Collection } from './pages/Collection';
import { Discover } from './pages/Discover';
import { Home } from './pages/Home';
import { Match } from './pages/Match';
import { Record } from './pages/Record';
import { Check } from './pages/Check';
import { Setup } from './pages/Setup';
import { Settings } from './pages/Settings';
import { Wantlist } from './pages/Wantlist';
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false } },
});

/**
 * Local mode (the installed apps): Discogs sends the user back with ?oauth_token=…&oauth_verifier=…
 * (or ?denied=…). Finish the sign-in, then tidy the address.
 */
function useConnectReturn() {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>(() => {
    const q = new URLSearchParams(window.location.search);
    return { busy: mode === 'local' && (q.has('oauth_verifier') || q.has('denied')), error: null };
  });
  useEffect(() => {
    if (!state.busy) return;
    const q = new URLSearchParams(window.location.search);
    const tidy = () => window.history.replaceState(null, '', window.location.pathname);
    if (q.has('denied')) { tidy(); setState({ busy: false, error: 'Connection canceled on Discogs.' }); return; }
    api.finishConnect(q.get('oauth_token') ?? '', q.get('oauth_verifier') ?? '')
      .then(() => { tidy(); setState({ busy: false, error: null }); void queryClient.invalidateQueries({ queryKey: ['status'] }); })
      .catch((e: Error) => { tidy(); setState({ busy: false, error: e.message }); });
  }, [state.busy]);
  return state;
}

function App() {
  const ret = useConnectReturn();
  const status = useQuery({ queryKey: ['status'], queryFn: api.status, enabled: !ret.busy });
  if (ret.busy) return <div className="room"><main className="main"><Loading label="Finishing sign-in with Discogs…" /></main></div>;
  if (status.isLoading) return <div className="room"><main className="main"><Loading /></main></div>;
  if (status.error) return <div className="room"><main className="main"><ErrorBox error={mode === 'server' ? `Can't reach the app's server. Is "npm run dev" running? (${(status.error as Error).message})` : (status.error as Error).message} /></main></div>;
  if (!status.data!.configured) return <Setup status={status.data!} error={ret.error} />;
  return (
    <Routes>
      <Route element={<Layout status={status.data!} />}>
        <Route index element={<Home />} />
        <Route path="collection" element={<Collection />} />
        <Route path="wantlist" element={<Wantlist />} />
        <Route path="match" element={<Match />} />
        <Route path="discover" element={<Discover />} />
        <Route path="record/:releaseId" element={<Record />} />
        <Route path="check" element={<Check />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
