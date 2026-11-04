import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Includeable, Op, UniqueConstraintError, WhereOptions } from 'sequelize';
import {
  ArtisanCompletionEstimateDto,
  ArtisanHireRequestDto,
  CancelHireRequestDto,
  CreateCompletionEstimateDto,
  CreateHireRequestDto,
  DeclineHireRequestDto,
  PaginatedHireRequestsResponse,
  ReviewHireRequestDto,
  Role,
} from '@golden-abode/types';

import { Artisan } from './models/artisan.model';
import { ArtisanHireRequest } from './models/artisan-hire-request.model';
import { ArtisanCompletionEstimate } from './models/artisan-completion-estimate.model';
import { toCompletionEstimateDto, toHireRequestDto } from './artisan-profile.mapper';
import { NOTIFICATION_SERVICE, NotificationService } from '../notifications/notification.interface';
import { Order } from '../orders/models/order.model';
import type { OrderDto } from '@golden-abode/types';
import { toOrderDto } from '../orders/order-display.mapper';
import {
  ARTISAN_RESPONSE_WINDOW_MS,
  CAPACITY_LOAD_STATUSES,
  OPEN_HIRE_REQUEST_STATUSES,
  isVisibleToArtisan,
} from './hire-request-rules';

// Loaded on every read that maps to a DTO, so the mapper can fill the
// customer's contact for the ustaad (0055). Only the two fields it shows.
const CUSTOMER_CONTACT_INCLUDE: Includeable = {
  association: 'customer',
  attributes: ['id', 'name', 'phone'],
};

// The window in which a completion estimate makes sense (spec §8.2): the
// request has been admin-approved and work is underway, but hasn't
// closed out yet. Shared by addEstimate (write) and the controller's
// assertCanViewHireRequest (read, for the PENDING_ADMIN_REVIEW case).
export const ACTIVE_ENGAGEMENT_STATUSES = new Set(['ACCEPTED_BY_ARTISAN', 'IN_PROGRESS']);

@Injectable()
export class HireRequestsService {
  private readonly logger = new Logger(HireRequestsService.name);

  constructor(
    @InjectModel(Artisan)
    private readonly artisanModel: typeof Artisan,
    @InjectModel(ArtisanHireRequest)
    private readonly hireRequestModel: typeof ArtisanHireRequest,
    @InjectModel(ArtisanCompletionEstimate)
    private readonly completionEstimateModel: typeof ArtisanCompletionEstimate,
    @InjectModel(Order)
    private readonly orderModel: typeof Order,
    @Inject(NOTIFICATION_SERVICE) private readonly notifications: NotificationService,
  ) {}

  // Same existence+verified gate as ArtisansService.getPublicProfile — a
  // customer cannot even attempt to hire an artisan who isn't verified
  // (LLD §4.5). isVerified and isAvailable answer different questions and
  // get different error shapes: an unverified artisan is indistinguishable
  // from one that doesn't exist (404, see getPublicProfile's own
  // reasoning), but an unavailable one is a real, verified artisan the
  // customer already found via their public profile — isAvailable is
  // shown right there, so hiding it behind a generic 404 here would be
  // pointless. 409 names the real reason instead.
  async createRequest(
    customerId: string,
    dto: CreateHireRequestDto,
  ): Promise<ArtisanHireRequestDto> {
    const artisan = await this.artisanModel.findByPk(dto.artisanId);
    if (!artisan || !artisan.isVerified) {
      throw new NotFoundException(`artisan ${dto.artisanId} not found`);
    }
    if (!artisan.isAvailable) {
      throw new ConflictException('this artisan is not currently available');
    }

    // Decision 0055: any number of ustaads at once, but one open request per
    // ustaad. The partial unique index backs this check against a race.
    const openWithSameArtisan = await this.hireRequestModel.count({
      where: {
        customerId,
        artisanId: dto.artisanId,
        status: { [Op.in]: OPEN_HIRE_REQUEST_STATUSES },
      },
    });
    if (openWithSameArtisan > 0) {
      throw new ConflictException('you already have an open request with this artisan');
    }

    try {
      const created = await this.hireRequestModel.create({
        customerId,
        artisanId: dto.artisanId,
        addressText: dto.addressText,
        notes: dto.notes ?? null,
      } as never);
      return toHireRequestDto(created, null);
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new ConflictException('you already have an open request with this artisan');
      }
      throw err;
    }
  }

  async listForCustomer(customerId: string): Promise<ArtisanHireRequestDto[]> {
    const requests = await this.hireRequestModel.findAll({
      where: { customerId },
      include: [CUSTOMER_CONTACT_INCLUDE],
      order: [['createdAt', 'DESC']],
    });
    return this.withLatestEstimates(requests);
  }

  // Excludes PENDING_ADMIN_REVIEW and ADMIN_REJECTED unconditionally — the
  // ustaad only ever sees requests the admin let through (spec §8.1, LLD §3,
  // 0055). There is no notified_at column; visibility is
  // notification-equivalent for this module's scope.
  async listForArtisan(artisanUserId: string): Promise<ArtisanHireRequestDto[]> {
    const artisan = await this.artisanModel.findOne({ where: { userId: artisanUserId } });
    if (!artisan) {
      throw new NotFoundException('no artisan profile found for this user');
    }

    const requests = await this.hireRequestModel.findAll({
      // Same rule as isVisibleToArtisan, as a query.
      where: {
        artisanId: artisan.id,
        adminReviewedAt: { [Op.ne]: null },
        status: { [Op.ne]: 'ADMIN_REJECTED' },
      },
      include: [CUSTOMER_CONTACT_INCLUDE],
      order: [['createdAt', 'DESC']],
    });
    return this.withLatestEstimates(requests);
  }

  // Carries the capacity signal (decision 0045 addendum): admin reviewing
  // a pending request sees how many other jobs that artisan already has
  // active, and their team size, to judge whether they can take on one
  // more. withCapacity = true here, and nowhere else, is deliberate — this
  // is the one surface that needs it.
  async listPendingAdminReview(
    page: number,
    limit: number,
  ): Promise<PaginatedHireRequestsResponse> {
    return this.listPage(page, limit, { status: 'PENDING_ADMIN_REVIEW' }, 'ASC', true);
  }

  // Admin tracking surface, decision 0045: every hire request regardless of
  // status, optionally narrowed to one — unlike listPendingAdminReview,
  // which is always the review queue alone.
  async listAll(
    page: number,
    limit: number,
    status?: string,
  ): Promise<PaginatedHireRequestsResponse> {
    return this.listPage(page, limit, status ? { status } : {}, 'DESC', false);
  }

  private async listPage(
    page: number,
    limit: number,
    where: Record<string, unknown>,
    order: 'ASC' | 'DESC',
    withCapacity: boolean,
  ): Promise<PaginatedHireRequestsResponse> {
    const offset = (page - 1) * limit;
    const { rows, count } = await this.hireRequestModel.findAndCountAll({
      where,
      include: [CUSTOMER_CONTACT_INCLUDE],
      limit,
      offset,
      order: [['createdAt', order]],
    });
    return {
      items: await this.withLatestEstimates(rows, withCapacity),
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    };
  }

  // One query for active-job counts and one for team sizes, covering every
  // artisan in the batch — same N+1-avoidance reasoning as
  // withLatestEstimates below, not a query per request.
  private async capacityByArtisanId(
    artisanIds: string[],
  ): Promise<Map<string, { activeJobCount: number; teamSize: number }>> {
    if (artisanIds.length === 0) {
      return new Map();
    }

    const [activeCounts, artisans] = await Promise.all([
      this.hireRequestModel.findAll({
        where: {
          artisanId: { [Op.in]: artisanIds },
          status: { [Op.in]: CAPACITY_LOAD_STATUSES },
        },
        attributes: ['artisanId'],
      }),
      this.artisanModel.findAll({
        where: { id: { [Op.in]: artisanIds } },
        include: ['team'],
      }),
    ]);

    const activeCountByArtisanId = new Map<string, number>();
    for (const row of activeCounts) {
      activeCountByArtisanId.set(
        row.artisanId,
        (activeCountByArtisanId.get(row.artisanId) ?? 0) + 1,
      );
    }

    const result = new Map<string, { activeJobCount: number; teamSize: number }>();
    for (const artisan of artisans) {
      result.set(artisan.id, {
        activeJobCount: activeCountByArtisanId.get(artisan.id) ?? 0,
        teamSize: (artisan.team ?? []).length,
      });
    }
    return result;
  }

  // The admin-gate invariant (spec §8.1, LLD §3): the only legal entry
  // point into PENDING_ARTISAN_RESPONSE or ADMIN_REJECTED is from
  // PENDING_ADMIN_REVIEW. Allowing a request sends it to the ustaad, who
  // then accepts or declines (0055); the admin never accepts for them.
  // A conditional UPDATE ... WHERE status = 'PENDING_ADMIN_REVIEW' is atomic — it is the single line that
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
    const nextStatus = dto.approve ? 'PENDING_ARTISAN_RESPONSE' : 'ADMIN_REJECTED';

    const [affected] = await this.hireRequestModel.update(
      {
        status: nextStatus,
        adminReviewedBy: adminUserId,
        adminReviewedAt: new Date(),
        adminRejectReason: dto.approve ? null : (dto.rejectReason ?? null),
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

    const updated = await this.hireRequestModel.findByPk(requestId, {
      include: [CUSTOMER_CONTACT_INCLUDE],
    });
    const artisan = await this.artisanModel.findByPk(updated!.artisanId);
    if (artisan) {
      await this.notifications.sendHireRequestStatusChanged(artisan.userId, requestId, nextStatus);
    }

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

  // Ustaad-initiated (0055): PENDING_ARTISAN_RESPONSE -> ACCEPTED_BY_ARTISAN,
  // only inside the response window. The window is part of the guarded
  // UPDATE, so a late accept fails even if the expiry sweep hasn't run yet.
  async acceptRequest(artisanUserId: string, requestId: string): Promise<ArtisanHireRequestDto> {
    const request = await this.respondAsArtisan(artisanUserId, requestId, {
      status: 'ACCEPTED_BY_ARTISAN',
      artisanRespondedAt: new Date(),
    });
    await this.notifications.sendHireRequestStatusChanged(
      request.customerId,
      requestId,
      'ACCEPTED_BY_ARTISAN',
    );
    return request;
  }

  // Ustaad-initiated (0055): PENDING_ARTISAN_RESPONSE -> ARTISAN_DECLINED.
  async declineRequest(
    artisanUserId: string,
    requestId: string,
    dto: DeclineHireRequestDto,
  ): Promise<ArtisanHireRequestDto> {
    const request = await this.respondAsArtisan(artisanUserId, requestId, {
      status: 'ARTISAN_DECLINED',
      artisanRespondedAt: new Date(),
      artisanDeclineReason: dto.reason,
    });
    await this.notifications.sendHireRequestStatusChanged(
      request.customerId,
      requestId,
      'ARTISAN_DECLINED',
    );
    return request;
  }

  private async respondAsArtisan(
    artisanUserId: string,
    requestId: string,
    updates: Partial<ArtisanHireRequest>,
  ): Promise<ArtisanHireRequestDto> {
    const artisan = await this.artisanModel.findOne({ where: { userId: artisanUserId } });
    if (!artisan) {
      throw new NotFoundException('no artisan profile found for this user');
    }
    const request = await this.getRequestById(requestId);
    await this.assertOwnedByArtisan(request, artisan.id);

    const windowOpenSince = new Date(Date.now() - ARTISAN_RESPONSE_WINDOW_MS);
    return this.claimTransition(requestId, {
      fromStatuses: ['PENDING_ARTISAN_RESPONSE'],
      extraWhere: { adminReviewedAt: { [Op.gt]: windowOpenSince } },
      updates,
      // Judged from the status after the UPDATE missed, not the read above:
      // still waiting means only the window can have stopped it; anything
      // else means another accept/decline/cancel got there first.
      conflictMessage: (currentStatus) =>
        currentStatus === 'PENDING_ARTISAN_RESPONSE'
          ? 'the time to respond to this hire request has passed'
          : undefined,
    });
  }

  // Decision 0055: closes every request the ustaad left unanswered past the
  // window, in one guarded UPDATE, so a concurrent accept and the sweep can't
  // both win. Returns how many it expired. Called by HireRequestExpirySweep.
  async expireStaleResponses(): Promise<number> {
    const cutoff = new Date(Date.now() - ARTISAN_RESPONSE_WINDOW_MS);
    const [, expired] = await this.hireRequestModel.update({ status: 'EXPIRED' } as never, {
      where: { status: 'PENDING_ARTISAN_RESPONSE', adminReviewedAt: { [Op.lte]: cutoff } },
      returning: true,
    });
    if (expired.length === 0) {
      return 0;
    }

    const artisans = await this.artisanModel.findAll({
      where: { id: { [Op.in]: [...new Set(expired.map((request) => request.artisanId))] } },
    });
    const artisanUserIdById = new Map(artisans.map((artisan) => [artisan.id, artisan.userId]));
    // The rows are already EXPIRED, so a later sweep won't retry them: one
    // failed notification must not cost everyone after it theirs.
    for (const request of expired) {
      const recipients = [request.customerId, artisanUserIdById.get(request.artisanId)];
      for (const userId of recipients) {
        if (!userId) continue;
        try {
          await this.notifications.sendHireRequestStatusChanged(userId, request.id, 'EXPIRED');
        } catch (err) {
          this.logger.error(
            `hire request ${request.id}: expiry notification to ${userId} failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }
    return expired.length;
  }

  // Artisan-initiated: ACCEPTED_BY_ARTISAN -> IN_PROGRESS. Same
  // conditional-UPDATE guard as reviewRequest, scoped additionally to
  // artisanId so an artisan cannot start work on another artisan's request.
  async startWork(artisanUserId: string, requestId: string): Promise<ArtisanHireRequestDto> {
    const artisan = await this.artisanModel.findOne({ where: { userId: artisanUserId } });
    if (!artisan) {
      throw new NotFoundException('no artisan profile found for this user');
    }
    const request = await this.getRequestById(requestId);
    await this.assertOwnedByArtisan(request, artisan.id);

    const result = await this.claimTransition(requestId, {
      fromStatuses: ['ACCEPTED_BY_ARTISAN'],
      updates: { status: 'IN_PROGRESS', startedAt: new Date() },
    });
    await this.notifications.sendHireRequestStatusChanged(
      request.customerId,
      requestId,
      'IN_PROGRESS',
    );
    return result;
  }

  // Artisan-initiated: IN_PROGRESS -> COMPLETED.
  async completeWork(artisanUserId: string, requestId: string): Promise<ArtisanHireRequestDto> {
    const artisan = await this.artisanModel.findOne({ where: { userId: artisanUserId } });
    if (!artisan) {
      throw new NotFoundException('no artisan profile found for this user');
    }
    const request = await this.getRequestById(requestId);
    await this.assertOwnedByArtisan(request, artisan.id);

    const result = await this.claimTransition(requestId, {
      fromStatuses: ['IN_PROGRESS'],
      updates: { status: 'COMPLETED', completedAt: new Date() },
    });
    await this.notifications.sendHireRequestStatusChanged(
      request.customerId,
      requestId,
      'COMPLETED',
    );
    return result;
  }

  // Customer (owner), artisan (owner), or admin may cancel. Legal from any
  // non-terminal, non-rejected status (spec 0045) -> CANCELLED. Ownership is
  // checked here, in the handler, same reasoning as
  // ArtisansController.assertCanViewHireRequest: a role alone never proves
  // ownership of this specific request.
  async cancel(
    callerId: string,
    callerRole: string,
    requestId: string,
    dto: CancelHireRequestDto,
  ): Promise<ArtisanHireRequestDto> {
    const request = await this.getRequestById(requestId);
    await this.assertCanCancel(callerId, callerRole, request);

    // 0055: while a request waits on the ustaad, the ustaad's way out is
    // decline, not cancel — so the customer and admin see the real reason.
    const artisanCaller = callerRole === Role.ARTISAN;
    if (artisanCaller && request.status === 'PENDING_ARTISAN_RESPONSE') {
      throw new ConflictException('decline this hire request instead of cancelling it');
    }
    const result = await this.claimTransition(requestId, {
      fromStatuses: artisanCaller
        ? ['ACCEPTED_BY_ARTISAN', 'IN_PROGRESS']
        : [
            'PENDING_ADMIN_REVIEW',
            'PENDING_ARTISAN_RESPONSE',
            'ACCEPTED_BY_ARTISAN',
            'IN_PROGRESS',
          ],
      updates: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: dto.reason },
    });

    // Notify whichever party did not initiate the cancellation. Admin-
    // initiated cancels notify both, matching reviewRequest's own
    // artisan-facing notification not distinguishing admin from "the
    // system" as an initiator.
    const artisan = await this.artisanModel.findByPk(request.artisanId);
    if (callerRole !== Role.CUSTOMER) {
      await this.notifications.sendHireRequestStatusChanged(
        request.customerId,
        requestId,
        'CANCELLED',
      );
    }
    // Not if the request never reached the ustaad (cancelled in admin review).
    if (callerRole !== Role.ARTISAN && artisan && isVisibleToArtisan(request)) {
      await this.notifications.sendHireRequestStatusChanged(artisan.userId, requestId, 'CANCELLED');
    }

    return result;
  }

  private async assertOwnedByArtisan(
    request: Pick<ArtisanHireRequest, 'artisanId'>,
    artisanId: string,
  ): Promise<void> {
    if (request.artisanId !== artisanId) {
      throw new ForbiddenException('this hire request does not belong to you');
    }
  }

  private async assertCanCancel(
    callerId: string,
    callerRole: string,
    request: ArtisanHireRequest,
  ): Promise<void> {
    if (callerRole === Role.ADMIN) {
      return;
    }
    if (callerRole === Role.CUSTOMER && request.customerId === callerId) {
      return;
    }
    // A request the ustaad can't see is forbidden, not a status conflict —
    // a 409 would confirm it exists (same boundary as the view guard).
    if (callerRole === Role.ARTISAN && isVisibleToArtisan(request)) {
      const artisan = await this.artisanModel.findOne({ where: { userId: callerId } });
      if (artisan && artisan.id === request.artisanId) {
        return;
      }
    }
    throw new ForbiddenException('you may not cancel this hire request');
  }

  // Shared guarded-transition shape behind every status change past the
  // initial admin review: a conditional UPDATE scoped to the legal source
  // statuses is the single line that enforces the whole invariant, same
  // reasoning as reviewRequest's own comment above and
  // OrdersService.cancelOrder's precedent — a bare read-then-write would let
  // a concurrent transition slip through the gap between them.
  private async claimTransition(
    requestId: string,
    options: {
      fromStatuses: string[];
      updates: Partial<ArtisanHireRequest>;
      extraWhere?: WhereOptions<ArtisanHireRequest>;
      // Given the request's status as it stands after the UPDATE missed.
      conflictMessage?: (currentStatus: string) => string | undefined;
    },
  ): Promise<ArtisanHireRequestDto> {
    const [affected] = await this.hireRequestModel.update(options.updates as never, {
      where: {
        ...(options.extraWhere as object),
        id: requestId,
        status: { [Op.in]: options.fromStatuses },
      },
    });

    if (affected === 0) {
      const current = await this.hireRequestModel.findByPk(requestId, { attributes: ['status'] });
      if (!current) {
        throw new NotFoundException(`hire request ${requestId} not found`);
      }
      throw new ConflictException(
        options.conflictMessage?.(current.status) ??
          'this hire request is not in a status that allows this transition',
      );
    }

    const updated = await this.hireRequestModel.findByPk(requestId, {
      include: [CUSTOMER_CONTACT_INCLUDE],
    });
    return toHireRequestDto(updated!, await this.latestEstimateFor(requestId));
  }

  async getRequestById(requestId: string): Promise<ArtisanHireRequest> {
    const request = await this.hireRequestModel.findByPk(requestId, {
      include: [CUSTOMER_CONTACT_INCLUDE],
    });
    if (!request) {
      throw new NotFoundException(`hire request ${requestId} not found`);
    }
    return request;
  }

  // Closes the "no single-hire-request GET" gap: previously the only way
  // to get one request's full shape was a list endpoint. The controller
  // resolves the model and checks ownership first (getRequestById +
  // assertCanViewHireRequest, same as getEstimateHistory/
  // listAttributedOrders) before calling this to map it to the DTO — this
  // method does not re-check ownership itself, same division of
  // responsibility as those two.
  //
  // Takes the already-loaded model, not an id (code review caught the
  // original version taking an id and re-querying the exact same row the
  // controller had just fetched one line earlier for the ownership check
  // — two findByPk round trips for one row on every single-hire-request
  // read). Mirrors claimTransition's own "map what's already loaded,
  // don't re-query" discipline elsewhere in this file.
  async mapToHireRequestDto(request: ArtisanHireRequest): Promise<ArtisanHireRequestDto> {
    const estimate = await this.latestEstimateFor(request.id);
    return toHireRequestDto(request, estimate);
  }

  // Decision 0045 item 7: the reverse of Order.bookingId — every order a
  // customer placed while attributing to this engagement, newest first.
  // Existence of the hire request itself is not re-checked here; the
  // controller already resolves it (via getRequestById) before calling
  // this, same division of responsibility as getEstimateHistory.
  async listAttributedOrders(requestId: string): Promise<OrderDto[]> {
    const orders = await this.orderModel.findAll({
      where: { bookingId: requestId },
      order: [['createdAt', 'DESC']],
    });
    return orders.map((order) => toOrderDto(order, false));
  }

  private async latestEstimateFor(requestId: string): Promise<ArtisanCompletionEstimate | null> {
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
    withCapacity = false,
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

    const capacityByArtisanId = withCapacity
      ? await this.capacityByArtisanId([...new Set(requests.map((request) => request.artisanId))])
      : new Map<string, { activeJobCount: number; teamSize: number }>();

    return requests.map((request) =>
      toHireRequestDto(
        request,
        latestByRequestId.get(request.id) ?? null,
        capacityByArtisanId.get(request.artisanId) ?? null,
      ),
    );
  }
}
