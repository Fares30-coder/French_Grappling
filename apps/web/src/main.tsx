import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import './index.css';
import { router } from './router';

// offlineFirst: requests still go out when the device is offline, so the service worker's cache
// can answer them (the default 'online' mode would pause them forever).
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, networkMode: 'offlineFirst' } },
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
