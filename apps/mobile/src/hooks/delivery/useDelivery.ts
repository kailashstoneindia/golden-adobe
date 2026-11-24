import type { DeliveryFailureReason, DeliveryJobDto } from '@golden-abode/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS, QUERY_KEYS } from '../../constants';
import type { DriverJobScope } from '../../constants';
import { deliveryService, uploadDeliveryPhoto } from '../../services/delivery';
import type { CapturedPhoto } from '../../services/delivery';

export function useDriverProfileQuery(isEnabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.driver.profile(),
    queryFn: () => deliveryService.fetchDriverProfile(),
    enabled: isEnabled,
  });
}

// No push yet, so the list polls while it is on screen (decision 0060).
export function useDriverDeliveriesQuery(scope: DriverJobScope, isEnabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.driver.deliveries(scope),
    queryFn: () => deliveryService.fetchDeliveries(scope),
    enabled: isEnabled,
    refetchInterval: scope === 'active' ? APP_CONSTANTS.driverJobsPollMs : false,
  });
}

export function useDeliveryJobQuery(jobId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.driver.delivery(jobId ?? ''),
    queryFn: () => deliveryService.fetchDelivery(jobId!),
    enabled: Boolean(jobId),
  });
}

function useStoreUpdatedJob() {
  const queryClient = useQueryClient();
  return async (job: DeliveryJobDto): Promise<void> => {
    queryClient.setQueryData(QUERY_KEYS.driver.delivery(job.id), job);
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.driver.all });
  };
}

export function usePickUpDeliveryMutation() {
  const storeUpdatedJob = useStoreUpdatedJob();
  return useMutation({
    mutationFn: (job: DeliveryJobDto) => deliveryService.pickUp(job),
    onSuccess: storeUpdatedJob,
  });
}

// Each attempt asks for a fresh upload ticket: a key is single-use per
// action, and a stale or mismatched key is rejected by the server.
export function useCompleteDeliveryMutation() {
  const storeUpdatedJob = useStoreUpdatedJob();
  return useMutation({
    mutationFn: async (input: { jobId: string; otp: string; photo: CapturedPhoto }) => {
      const upload = await deliveryService.requestDriverPhotoUpload(
        input.jobId,
        'delivered',
        input.photo.contentType,
      );
      const photoKey = await uploadDeliveryPhoto(upload, input.photo);
      return deliveryService.complete(input.jobId, input.otp, photoKey);
    },
    onSuccess: storeUpdatedJob,
  });
}

export function useFailDeliveryMutation() {
  const storeUpdatedJob = useStoreUpdatedJob();
  return useMutation({
    mutationFn: async (input: {
      jobId: string;
      reason: DeliveryFailureReason;
      note: string;
      photo: CapturedPhoto;
    }) => {
      const upload = await deliveryService.requestDriverPhotoUpload(
        input.jobId,
        'failed',
        input.photo.contentType,
      );
      const photoKey = await uploadDeliveryPhoto(upload, input.photo);
      const note = input.note.trim();
      return deliveryService.fail(input.jobId, {
        reason: input.reason,
        photoKey,
        ...(note ? { note } : {}),
      });
    },
    onSuccess: storeUpdatedJob,
  });
}

export function useVendorHandoverMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { groupId: string; photo: CapturedPhoto | null }) => {
      let photoKey: string | undefined;
      if (input.photo) {
        const upload = await deliveryService.requestVendorPhotoUpload(
          input.groupId,
          input.photo.contentType,
        );
        photoKey = await uploadDeliveryPhoto(upload, input.photo);
      }
      return deliveryService.handOver(input.groupId, photoKey);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vendorOrderGroups.all });
    },
  });
}
