import { useMutation } from '@tanstack/react-query';

import { QUERY_KEYS } from '../../constants';
import { queryClient } from '../../lib/query-client';
import { authService } from '../../services';
import { useOnboardingStore } from '../../stores/onboarding.store';

export function useLogout() {
  return useMutation({
    mutationFn: () => authService.logout(),
    onSettled: () => {
      useOnboardingStore.getState().clear();
      queryClient.removeQueries({ queryKey: QUERY_KEYS.auth.all });
    },
  });
}
