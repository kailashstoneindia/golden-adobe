import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ComponentType, type ReactNode } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { queryClient } from '../lib/query-client';

interface QueryProviderProps {
  children: ReactNode;
}

// React Native has no window focus event, so React Query never learns the
// app came back to the foreground. Feeding AppState into focusManager makes
// stale queries refetch when the user returns to the app.
function onAppStateChange(status: AppStateStatus): void {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
}

export function QueryProvider({ children }: QueryProviderProps) {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

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
