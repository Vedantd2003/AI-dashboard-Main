'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { ApiError, wakeApi } from '@/lib/api';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Never retry auth, not-configured, validation or rate-limit errors — retrying cannot help.
            retry: (count, err) => !(err instanceof ApiError && (err.status < 500 || err.notConfigured)) && count < 2,
          },
        },
      }),
  );
  // Start waking the API the moment any page opens, so it is ready by the time a form is submitted.
  useEffect(() => {
    void wakeApi();
  }, []);
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster theme="dark" position="bottom-right" toastOptions={{ style: { background: '#172238', border: '1px solid #34476a', color: '#ece5d3', fontFamily: 'Inter Variable, sans-serif' } }} />
    </QueryClientProvider>
  );
}
