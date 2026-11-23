import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { api } from './api';
import { Layout } from './components/Layout';
import { ErrorBox, Loading } from './components/ui';
import { Collection } from './pages/Collection';
import { Discover } from './pages/Discover';
import { Home } from './pages/Home';
import { Match } from './pages/Match';
import { Record } from './pages/Record';
import { Check } from './pages/Check';
import { Setup } from './pages/Setup';
import { Wantlist } from './pages/Wantlist';
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false } },
});

function App() {
  const status = useQuery({ queryKey: ['status'], queryFn: api.status });
  if (status.isLoading) return <div className="room"><main className="main"><Loading /></main></div>;
  if (status.error) return <div className="room"><main className="main"><ErrorBox error={`Can't reach the app's server. Is "npm run dev" running? (${(status.error as Error).message})`} /></main></div>;
  if (!status.data!.configured) return <Setup status={status.data!} />;
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
