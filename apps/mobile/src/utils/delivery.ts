import type { DeliveryAssignmentStatus, DeliveryJobDto } from '@golden-abode/types';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import { ROUTES } from '../constants';
import type { BadgeVariant } from '../components/ui';

export function toDeliveryJobBadgeVariant(status: DeliveryAssignmentStatus): BadgeVariant {
  if (status === 'delivered') return 'success';
  if (status === 'failed' || status === 'cancelled') return 'error';
  if (status === 'picked_up') return 'info';
  return 'pending';
}

/** The driver can still act on the job: not finished and not blocked. */
export function isDeliveryJobActionable(job: DeliveryJobDto): boolean {
  return !job.blocked && (job.status === 'assigned' || job.status === 'picked_up');
}

export function formatDropAddress(drop: DeliveryJobDto['drop']): string {
  return [drop.addressLine1, drop.addressLine2, `${drop.city} ${drop.pincode}`]
    .filter(Boolean)
    .join(', ');
}

export function callPhone(phone: string): void {
  void Linking.openURL(`tel:${phone}`);
}

// One URL that opens Google Maps or the browser on both platforms.
export function openMapAt(lat: number, lng: number): void {
  void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
}

export function navigateToDeliveryJob(jobId: string): void {
  router.push({ pathname: ROUTES.screens.deliveryDetail, params: { id: jobId } });
}

export function navigateToDeliveryStep(step: 'pickup' | 'complete' | 'fail', jobId: string): void {
  const pathname =
    step === 'pickup'
      ? ROUTES.screens.deliveryPickup
      : step === 'complete'
        ? ROUTES.screens.deliveryComplete
        : ROUTES.screens.deliveryFail;
  router.push({ pathname, params: { id: jobId } });
}

/** A 6-digit code with nothing else in it. */
export function isDeliveryOtp(value: string): boolean {
  return /^\d{6}$/.test(value);
}
