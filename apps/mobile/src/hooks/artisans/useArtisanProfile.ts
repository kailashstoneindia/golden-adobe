import type {
  ArtisanAccountDetailsInputDto,
  ArtisanOnboardDto,
  ArtisanProfileDto,
  ArtisanPublicProfileDto,
  UpdateArtisanProfileDto,
} from '@golden-abode/types';
import { Role, type UserDto } from '@golden-abode/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS, QUERY_KEYS } from '../../constants';
import { artisansService, uploadToPresignedPost } from '../../services';
import type { ArtisanDocumentFile } from '../../types';
import { isArtisanOnboardingComplete, isNotFoundError } from '../../utils';

export function useArtisanProfileQuery(isEnabled: boolean) {
  return useQuery<ArtisanProfileDto>({
    queryKey: QUERY_KEYS.artisan.profile(),
    queryFn: () => artisansService.fetchMe(),
    enabled: isEnabled,
    staleTime: APP_CONSTANTS.artisanProfileStaleTimeMs,
    // 404 is an answer ("no profile yet"), not a transient failure.
    retry: (failureCount, error) => !isNotFoundError(error) && failureCount < 1,
  });
}

/** Whether an Ustaad still has to finish onboarding before using the app. */
export function useArtisanOnboardingStatus(user: UserDto | null | undefined) {
  const isArtisan = user?.role === Role.ARTISAN;
  const profileQuery = useArtisanProfileQuery(isArtisan);
  const isMissingProfile = isNotFoundError(profileQuery.error);
  const needsOnboarding =
    isArtisan &&
    (isMissingProfile ||
      (profileQuery.isSuccess && !isArtisanOnboardingComplete(profileQuery.data)));

  return {
    isChecking: isArtisan && profileQuery.isLoading,
    needsOnboarding,
  };
}

export function useArtisanOnboardMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: ArtisanOnboardDto) => artisansService.onboard(dto),
    onSuccess: (profile) => {
      queryClient.setQueryData(QUERY_KEYS.artisan.profile(), profile);
    },
  });
}

export function useUpdateArtisanProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateArtisanProfileDto) => artisansService.updateMe(body),
    onSuccess: (profile) => {
      queryClient.setQueryData(QUERY_KEYS.artisan.profile(), profile);
    },
  });
}

export function useReplaceArtisanAccountDetailsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ArtisanAccountDetailsInputDto) =>
      artisansService.replaceAccountDetails(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.artisan.profile() });
    },
  });
}

/** Presign → direct S3 POST → confirm. The presign expires in 5 minutes, so it is requested only once a file is picked. */
export function useUploadArtisanDocumentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: ArtisanDocumentFile) => {
      const upload = await artisansService.createDocumentUploadUrl(file.mimeType);
      await uploadToPresignedPost(upload, file);
      return artisansService.confirmDocumentUpload(upload.fields.key);
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(QUERY_KEYS.artisan.profile(), profile);
    },
  });
}

export function useArtisanPublicProfileQuery(artisanId: string | null) {
  return useQuery<ArtisanPublicProfileDto>({
    queryKey: QUERY_KEYS.artisan.publicProfile(artisanId ?? ''),
    queryFn: () => artisansService.fetchPublicProfile(artisanId!),
    enabled: Boolean(artisanId),
    retry: (failureCount, error) => !isNotFoundError(error) && failureCount < 1,
  });
}
