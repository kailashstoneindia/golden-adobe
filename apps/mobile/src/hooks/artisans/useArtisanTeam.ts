import type { ArtisanTeamMemberInputDto } from '@golden-abode/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { QUERY_KEYS } from '../../constants';
import { artisansService } from '../../services';

// Team members are embedded in the profile response, so every mutation
// refreshes the profile rather than keeping a separate team cache.
function useInvalidateArtisanProfile() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.artisan.profile() });
}

export function useAddTeamMemberMutation() {
  const invalidateProfile = useInvalidateArtisanProfile();
  return useMutation({
    mutationFn: (body: ArtisanTeamMemberInputDto) => artisansService.addTeamMember(body),
    onSuccess: invalidateProfile,
  });
}

export function useUpdateTeamMemberMutation() {
  const invalidateProfile = useInvalidateArtisanProfile();
  return useMutation({
    mutationFn: (options: { memberId: string; body: ArtisanTeamMemberInputDto }) =>
      artisansService.updateTeamMember(options.memberId, options.body),
    onSuccess: invalidateProfile,
  });
}

export function useRemoveTeamMemberMutation() {
  const invalidateProfile = useInvalidateArtisanProfile();
  return useMutation({
    mutationFn: (memberId: string) => artisansService.removeTeamMember(memberId),
    onSuccess: invalidateProfile,
  });
}
