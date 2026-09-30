import { QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType, ReactNode } from 'react';

import { queryClient } from '../lib/query-client';

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  // QueryClientProvider's own compiled types resolve against a duplicate,
  // stale @types/react copy that a transitive peer dependency (zustand, used
  // elsewhere in this app) pins in the workspace lockfile -- not something
  // this file or its own `react`/`@types/react` imports control. The runtime
  // behavior is unaffected; this narrows the structural mismatch at the one
  // call site it surfaces, rather than overriding a shared dependency's
  // peer resolution for the whole workspace.
  const Provider = QueryClientProvider as ComponentType<{
    client: typeof queryClient;
    children?: ReactNode;
  }>;
  return <Provider client={queryClient}>{children}</Provider>;
}
