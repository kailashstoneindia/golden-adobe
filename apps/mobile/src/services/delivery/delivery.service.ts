import type { DeliveryFailureReason, DeliveryJobDto, DriverProfileDto } from '@golden-abode/types';

import { apiClient } from '../../api/client';
import { API_ENDPOINTS } from '../../constants';
import type { DriverJobScope } from '../../constants';
import type { DeliveryPhotoContentType, PresignedPhotoUpload } from './delivery-photo.service';

const DRIVER = API_ENDPOINTS.driver;
const VENDOR = API_ENDPOINTS.vendors;

// Decision 0060. `jobId` is always the assignment id (DeliveryJobDto.id),
// never the order or group id.
export const deliveryService = {
  fetchDriverProfile(): Promise<DriverProfileDto> {
    return apiClient.get<DriverProfileDto>(DRIVER.me);
  },

  fetchDeliveries(scope: DriverJobScope): Promise<DeliveryJobDto[]> {
    return apiClient.get<DeliveryJobDto[]>(DRIVER.deliveries, { params: { scope } });
  },

  fetchDelivery(jobId: string): Promise<DeliveryJobDto> {
    return apiClient.get<DeliveryJobDto>(DRIVER.deliveryById(jobId));
  },

  // The server requires every item of the job, each loaded: true.
  pickUp(job: DeliveryJobDto): Promise<DeliveryJobDto> {
    return apiClient.post<DeliveryJobDto>(DRIVER.deliveryPickup(job.id), {
      items: job.items.map((item) => ({ orderItemId: item.orderItemId, loaded: true })),
    });
  },

  requestDriverPhotoUpload(
    jobId: string,
    kind: 'delivered' | 'failed',
    contentType: DeliveryPhotoContentType,
  ): Promise<PresignedPhotoUpload> {
    return apiClient.post<PresignedPhotoUpload>(DRIVER.deliveryPhotoUrl(jobId), {
      kind,
      contentType,
    });
  },

  complete(jobId: string, otp: string, photoKey: string): Promise<DeliveryJobDto> {
    return apiClient.post<DeliveryJobDto>(DRIVER.deliveryComplete(jobId), { otp, photoKey });
  },

  fail(
    jobId: string,
    body: { reason: DeliveryFailureReason; photoKey: string; note?: string },
  ): Promise<DeliveryJobDto> {
    return apiClient.post<DeliveryJobDto>(DRIVER.deliveryFail(jobId), body);
  },

  requestVendorPhotoUpload(
    groupId: string,
    contentType: DeliveryPhotoContentType,
  ): Promise<PresignedPhotoUpload> {
    return apiClient.post<PresignedPhotoUpload>(VENDOR.orderGroupPhotoUrl(groupId), {
      contentType,
    });
  },

  // Safe to repeat: the server keeps the first timestamp.
  handOver(
    groupId: string,
    photoKey?: string,
  ): Promise<{ groupId: string; vendorHandedOverAt: string }> {
    return apiClient.post<{ groupId: string; vendorHandedOverAt: string }>(
      VENDOR.orderGroupHandover(groupId),
      photoKey ? { photoKey } : {},
    );
  },
};
