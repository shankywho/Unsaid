import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Outlet } from 'react-router-dom';

const qc = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 15_000, retry: 1 } },
});

/** Data layer for /login and /app only, so the landing page never downloads it. */
export function ConsoleRoot() {
  return (
    <QueryClientProvider client={qc}>
      <Outlet />
    </QueryClientProvider>
  );
}
