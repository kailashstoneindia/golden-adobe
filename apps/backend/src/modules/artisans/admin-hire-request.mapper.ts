import { Includeable } from 'sequelize';
import { AdminHireRequestDto } from '@golden-abode/types';

import {
  ADMIN_CONTACT_ATTRIBUTES,
  toAdminContactDto,
  toAdminContactWithoutEmailDto,
} from '../../common/mappers/admin-contact.mapper';
import { toHireRequestDto } from './artisan-profile.mapper';
import { ArtisanCompletionEstimate } from './models/artisan-completion-estimate.model';
import { ArtisanHireRequest } from './models/artisan-hire-request.model';

// What the admin hire-request lists load (decision 0056): both parties'
// contact and who reviewed it. The ustaad's email is mapped away below, not
// just left unloaded, so it can't leak through a later include change.
export const ADMIN_HIRE_REQUEST_INCLUDES: Includeable[] = [
  { association: 'customer', attributes: ADMIN_CONTACT_ATTRIBUTES },
  {
    association: 'artisan',
    attributes: ['id', 'tradeType'],
    include: [{ association: 'user', attributes: ADMIN_CONTACT_ATTRIBUTES }],
  },
  { association: 'adminReviewer', attributes: ['id', 'name'] },
];

export function toAdminHireRequestDto(
  request: ArtisanHireRequest,
  latestEstimate: ArtisanCompletionEstimate | null,
  capacity: { activeJobCount: number; teamSize: number } | null,
  estimateCount: number,
): AdminHireRequestDto {
  const customer = toAdminContactDto(request.customer);
  return {
    ...toHireRequestDto(request, latestEstimate, capacity),
    // The admin sees contact in every status; the ustaad's own view keeps
    // decision 0055's narrower window (toHireRequestDto).
    customerName: customer?.name ?? null,
    customerPhone: customer?.phone ?? null,
    customer,
    artisan: toAdminContactWithoutEmailDto(request.artisan?.user),
    artisanTradeType: request.artisan?.tradeType ?? null,
    adminReviewerName: request.adminReviewer?.name ?? null,
    estimateCount,
  };
}
