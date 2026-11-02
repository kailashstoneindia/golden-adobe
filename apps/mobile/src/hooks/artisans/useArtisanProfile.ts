import type {
  ArtisanAccountDetailsInputDto,
  ArtisanOnboardDto,
  ArtisanProfileDto,
  ArtisanPublicProfileDto,
  ArtisanSearchQuery,
  PaginatedArtisanPublicProfilesResponse,
  UpdateArtisanProfileDto,
} from '@golden-abode/types';
import { Role, type UserDto } from '@golden-abode/types';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS, ARTISAN_CONSTANTS, QUERY_KEYS } from '../../constants';
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

/**
 * Team-member documents have no confirm step: the uploaded key is passed
 * straight to the team member's `documentUrl` on create/update.
 */
export function useUploadTeamMemberDocumentMutation() {
  return useMutation({
    mutationFn: async (file: ArtisanDocumentFile): Promise<string> => {
      const upload = await artisansService.createDocumentUploadUrl(file.mimeType, 'team_member');
      await uploadToPresignedPost(upload, file);
      return upload.fields.key;
    },
  });
}

type ArtisanSearchFilters = Pick<ArtisanSearchQuery, 'tradeType' | 'pincode'>;

/** First page only, for previews such as the customer home section. */
export function useArtisanSearchQuery(filters: ArtisanSearchFilters, limit: number) {
  const query: ArtisanSearchQuery = { ...filters, page: 1, limit };
  return useQuery<PaginatedArtisanPublicProfilesResponse>({
    queryKey: QUERY_KEYS.artisan.search(JSON.stringify(query)),
    queryFn: () => artisansService.searchArtisans(query),
    staleTime: 60_000,
  });
}

export function useArtisanSearchInfiniteQuery(filters: ArtisanSearchFilters) {
  return useInfiniteQuery({
    queryKey: QUERY_KEYS.artisan.search(`infinite:${JSON.stringify(filters)}`),
    queryFn: ({ pageParam }) =>
      artisansService.searchArtisans({
        ...filters,
        page: pageParam,
        limit: ARTISAN_CONSTANTS.searchPageSize,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    staleTime: 60_000,
  });
}
