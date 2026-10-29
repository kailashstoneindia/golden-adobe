import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  ArtisanCompletionEstimateDto,
  ArtisanHireRequestDto,
  CreateCompletionEstimateDto,
  CreateHireRequestDto,
  PaginatedHireRequestsResponse,
  ReviewHireRequestDto,
} from '@golden-abode/types';

import { Artisan } from './models/artisan.model';
import { ArtisanHireRequest } from './models/artisan-hire-request.model';
import { ArtisanCompletionEstimate } from './models/artisan-completion-estimate.model';
import { toCompletionEstimateDto, toHireRequestDto } from './artisan-profile.mapper';

// The window in which a completion estimate makes sense (spec §8.2): the
// request has been admin-approved and work is underway, but hasn't
// closed out yet. Shared by addEstimate (write) and the controller's
// assertCanViewHireRequest (read, for the PENDING_ADMIN_REVIEW case).
export const ACTIVE_ENGAGEMENT_STATUSES = new Set(['ACCEPTED_BY_ARTISAN', 'IN_PROGRESS']);

@Injectable()
export class HireRequestsService {
  constructor(
    @InjectModel(Artisan)
    private readonly artisanModel: typeof Artisan,
    @InjectModel(ArtisanHireRequest)
    private readonly hireRequestModel: typeof ArtisanHireRequest,
    @InjectModel(ArtisanCompletionEstimate)
    private readonly completionEstimateModel: typeof ArtisanCompletionEstimate,
  ) {}

  // Same existence+verified gate as ArtisansService.getPublicProfile — a
  // customer cannot even attempt to hire an artisan who isn't verified
  // (LLD §4.5).
  async createRequest(
    customerId: string,
    dto: CreateHireRequestDto,
  ): Promise<ArtisanHireRequestDto> {
    const artisan = await this.artisanModel.findByPk(dto.artisanId);
    if (!artisan || !artisan.isVerified) {
      throw new NotFoundException(`artisan ${dto.artisanId} not found`);
    }

    const created = await this.hireRequestModel.create({
      customerId,
      artisanId: dto.artisanId,
      addressText: dto.addressText,
      notes: dto.notes ?? null,
    } as never);

    return toHireRequestDto(created, null);
  }

  async listForCustomer(customerId: string): Promise<ArtisanHireRequestDto[]> {
    const requests = await this.hireRequestModel.findAll({
      where: { customerId },
      order: [['createdAt', 'DESC']],
    });
    return this.withLatestEstimates(requests);
  }

  // Excludes PENDING_ADMIN_REVIEW unconditionally — this filter IS the
  // mechanism by which "artisan is only notified after admin approval" is
  // enforced (spec §8.1, LLD §3). There is no notified_at column;
  // visibility is notification-equivalent for this module's scope.
  async listForArtisan(artisanUserId: string): Promise<ArtisanHireRequestDto[]> {
    const artisan = await this.artisanModel.findOne({ where: { userId: artisanUserId } });
    if (!artisan) {
      throw new NotFoundException('no artisan profile found for this user');
    }

    const requests = await this.hireRequestModel.findAll({
      where: { artisanId: artisan.id, status: { [Op.ne]: 'PENDING_ADMIN_REVIEW' } },
      order: [['createdAt', 'DESC']],
    });
    return this.withLatestEstimates(requests);
  }

  async listPendingAdminReview(
    page: number,
    limit: number,
  ): Promise<PaginatedHireRequestsResponse> {
    const offset = (page - 1) * limit;
    const { rows, count } = await this.hireRequestModel.findAndCountAll({
      where: { status: 'PENDING_ADMIN_REVIEW' },
      limit,
      offset,
      order: [['createdAt', 'ASC']],
    });
    return {
      items: await this.withLatestEstimates(rows),
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    };
  }

  // The admin-gate invariant (spec §8.1, LLD §3): the only legal entry
  // point into ACCEPTED_BY_ARTISAN or ADMIN_REJECTED is from
  // PENDING_ADMIN_REVIEW. A conditional UPDATE ... WHERE status =
  // 'PENDING_ADMIN_REVIEW' is atomic — it is the single line that
  // enforces the whole invariant, including under a race between two
  // admins reviewing the same request simultaneously — mirroring the
  // conditional-UPDATE pattern OrdersService.cancelOrder already uses for
  // the same reason (a bare read-then-write would let a concurrent review
  // slip through the gap between them).
  async reviewRequest(
    adminUserId: string,
    requestId: string,
    dto: ReviewHireRequestDto,
  ): Promise<ArtisanHireRequestDto> {
    const nextStatus = dto.approve ? 'ACCEPTED_BY_ARTISAN' : 'ADMIN_REJECTED';

    const [affected] = await this.hireRequestModel.update(
      {
        status: nextStatus,
        adminReviewedBy: adminUserId,
        adminReviewedAt: new Date(),
        adminRejectReason: dto.approve ? null : dto.rejectReason ?? null,
      } as never,
      { where: { id: requestId, status: 'PENDING_ADMIN_REVIEW' } },
    );

    if (affected === 0) {
      const exists = await this.hireRequestModel.count({ where: { id: requestId } });
      if (!exists) {
        throw new NotFoundException(`hire request ${requestId} not found`);
      }
      throw new ConflictException(
        'this hire request has already been reviewed and cannot be reviewed again',
      );
    }

    const updated = await this.hireRequestModel.findByPk(requestId);
    return toHireRequestDto(updated!, await this.latestEstimateFor(requestId));
  }

  // Always INSERTs a new row, never updates one (spec §8.2/§8.4
  // append-only).
  async addEstimate(
    artisanUserId: string,
    requestId: string,
    dto: CreateCompletionEstimateDto,
  ): Promise<ArtisanCompletionEstimateDto> {
    const artisan = await this.artisanModel.findOne({ where: { userId: artisanUserId } });
    if (!artisan) {
      throw new NotFoundException('no artisan profile found for this user');
    }

    const request = await this.hireRequestModel.findByPk(requestId);
    if (!request) {
      throw new NotFoundException(`hire request ${requestId} not found`);
    }
    if (request.artisanId !== artisan.id) {
      throw new ForbiddenException('this hire request does not belong to you');
    }
    // Spec §8.2: the estimate is given "after the site visit", which only
    // happens once admin has approved the request and the artisan is
    // actively engaged — not before approval (the artisan isn't even
    // notified yet, per listForArtisan's own PENDING_ADMIN_REVIEW
    // exclusion) and not after the engagement has closed.
    if (!ACTIVE_ENGAGEMENT_STATUSES.has(request.status)) {
      throw new ForbiddenException(
        'an estimate can only be added while this hire request is accepted or in progress',
      );
    }

    const estimate = await this.completionEstimateModel.create({
      hireRequestId: requestId,
      estimatedDays: dto.estimatedDays,
      note: dto.note ?? null,
    } as never);

    return toCompletionEstimateDto(estimate);
  }

  // Ordered oldest -> newest (LLD §4.7) — the full revision history, not
  // just the latest.
  async getEstimateHistory(requestId: string): Promise<ArtisanCompletionEstimateDto[]> {
    const request = await this.hireRequestModel.findByPk(requestId);
    if (!request) {
      throw new NotFoundException(`hire request ${requestId} not found`);
    }

    const estimates = await this.completionEstimateModel.findAll({
      where: { hireRequestId: requestId },
      order: [['createdAt', 'ASC']],
    });
    return estimates.map(toCompletionEstimateDto);
  }

  async getRequestById(requestId: string): Promise<ArtisanHireRequest> {
    const request = await this.hireRequestModel.findByPk(requestId);
    if (!request) {
      throw new NotFoundException(`hire request ${requestId} not found`);
    }
    return request;
  }

  private async latestEstimateFor(
    requestId: string,
  ): Promise<ArtisanCompletionEstimate | null> {
    return this.completionEstimateModel.findOne({
      where: { hireRequestId: requestId },
      order: [['createdAt', 'DESC']],
    });
  }

  // One query for every request in the batch, instead of one findOne()
  // per request — list endpoints otherwise do N+1 round trips that scale
  // with queue size. createdAt ASC means the last row seen per
  // hireRequestId in the reduce is the latest, since estimates are
  // append-only (never updated in place).
  private async withLatestEstimates(
    requests: ArtisanHireRequest[],
  ): Promise<ArtisanHireRequestDto[]> {
    if (requests.length === 0) return [];

    const estimates = await this.completionEstimateModel.findAll({
      where: { hireRequestId: { [Op.in]: requests.map((request) => request.id) } },
      order: [['createdAt', 'ASC']],
    });

    const latestByRequestId = new Map<string, ArtisanCompletionEstimate>();
    for (const estimate of estimates) {
      latestByRequestId.set(estimate.hireRequestId, estimate);
    }

    return requests.map((request) =>
      toHireRequestDto(request, latestByRequestId.get(request.id) ?? null),
    );
  }
}
