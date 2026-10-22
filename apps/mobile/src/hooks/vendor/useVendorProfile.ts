import type { UpdateVendorProfileDto } from '@golden-abode/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS, QUERY_KEYS } from '../../constants';
import { vendorService } from '../../services';

export function useVendorProfileQuery(isEnabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.vendor.profile(),
    queryFn: () => vendorService.fetchMe(),
    enabled: isEnabled,
    staleTime: APP_CONSTANTS.vendorProfileStaleTimeMs,
  });
}

export function useUpdateVendorProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateVendorProfileDto) => vendorService.updateMe(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vendor.profile() });
    },
  });
}
