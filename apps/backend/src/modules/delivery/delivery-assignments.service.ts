import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes, Transaction, UniqueConstraintError } from 'sequelize';
import { DELIVERY_ASSIGNMENT_STATUSES } from '@golden-abode/types';
import type {
  AdminAssignmentDto,
  DeliveryAssignmentStatus,
  DeliveryFailureReason,
  PaginatedResponse,
  QueueItemDto,
} from '@golden-abode/types';
import { LOCKED_PARENT_ORDER_STATUSES } from '../orders/refund-status';
import { OrderStatus } from '../orders/models/order.model';
import { OrderVendorGroupStatus } from '../orders/models/order-vendor-group.model';
import { Driver } from './models/driver.model';
import { User } from '../users/models/user.model';
import { DeliveryAssignment } from './models/delivery-assignment.model';
import { assertParentNotLocked } from './delivery-rules';
import { generateDeliveryOtp } from './delivery-otp';
import { NOTIFICATION_SERVICE, NotificationService } from '../notifications/notification.interface';
import { OBJECT_STORAGE, ObjectStorage } from '../catalog/media/object-storage';
import {
  AssignDeliveryDto,
  AssignmentListQueryDto,
  QueueQueryDto,
} from './dto/delivery-assignment.dto';

type QueueRow = {
  group_id: string;
  order_id: string;
  shop_name: string;
  vendor_city: string | null;
  drop_city: string | null;
  drop_pincode: string | null;
  item_count: string;
  ready_at: Date;
};

type AssignmentRow = {
  id: string;
  status: DeliveryAssignmentStatus;
  attempt_no: number;
  group_id: string;
  order_id: string;
  shop_name: string;
  driver_id: string;
  driver_name: string;
  driver_phone: string | null;
  assigned_at: Date;
  vendor_handed_over_at: Date | null;
  picked_up_at: Date | null;
  delivered_at: Date | null;
  failed_at: Date | null;
  failure_reason: DeliveryFailureReason | null;
  delivery_photo_key: string | null;
  failure_photo_key: string | null;
};

const OPEN_STATUSES = [
  DELIVERY_ASSIGNMENT_STATUSES.ASSIGNED,
  DELIVERY_ASSIGNMENT_STATUSES.PICKED_UP,
];

// Photo links are short-lived; the board is refreshed often enough.
const PHOTO_PRESIGN_TTL_SECONDS = 300;

const iso = (d: Date | null): string | null => (d ? new Date(d).toISOString() : null);

@Injectable()
export class DeliveryAssignmentsService {
  constructor(
    @InjectModel(DeliveryAssignment) private readonly assignmentModel: typeof DeliveryAssignment,
    @InjectModel(Driver) private readonly driverModel: typeof Driver,
    private readonly sequelize: Sequelize,
    private readonly configService: ConfigService,
    @Inject(NOTIFICATION_SERVICE) private readonly notifications: NotificationService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  private readonly logger = new Logger(DeliveryAssignmentsService.name);

  // Groups the vendor has marked ready that nobody has been assigned to yet,
  // oldest first. A group under a refunded or cancelled order never shows.
  // The drop is the address frozen at checkout, falling back to the live row
  // for orders placed before the snapshot existed. updated_at stands in for
  // "ready at": nothing else touches a group between ready and assignment.
  async listQueue(query: QueueQueryDto): Promise<PaginatedResponse<QueueItemDto>> {
    const page = query.page ?? 1;
    const limit = query.pageSize ?? 20;
    const replacements = {
      ready: 'ready_for_pickup',
      locked: [...LOCKED_PARENT_ORDER_STATUSES],
      open: OPEN_STATUSES,
      cityId: query.cityId ?? null,
      limit,
      offset: (page - 1) * limit,
    };
    const from = `
      FROM order_vendor_group g
      JOIN orders o ON o.id = g.order_id
      JOIN vendors v ON v.id = g.vendor_id
      LEFT JOIN city c ON c.id = v.city_id
      LEFT JOIN customer_addresses a ON a.id = o.delivery_address_id
      WHERE g.status = :ready
        AND o.status NOT IN (:locked)
        AND (:cityId::uuid IS NULL OR v.city_id = :cityId::uuid)
        AND NOT EXISTS (
          SELECT 1 FROM delivery_assignments d
          WHERE d.order_vendor_group_id = g.id AND d.status IN (:open)
        )`;

    const rows = await this.sequelize.query<QueueRow>(
      `SELECT g.id AS group_id, g.order_id, v.shop_name, c.name AS vendor_city,
              COALESCE(o.delivery_address_snapshot->>'city', a.city) AS drop_city,
              COALESCE(o.delivery_address_snapshot->>'pincode', a.pincode) AS drop_pincode,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_vendor_group_id = g.id) AS item_count,
              g.updated_at AS ready_at
       ${from}
       ORDER BY g.updated_at ASC, g.id ASC
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );
    const [{ total }] = await this.sequelize.query<{ total: string }>(
      `SELECT COUNT(*) AS total ${from}`,
      { replacements, type: QueryTypes.SELECT },
    );

    return {
      items: rows.map((r) => ({
        groupId: r.group_id,
        orderId: r.order_id,
        vendorName: r.shop_name,
        vendorCity: r.vendor_city,
        dropCity: r.drop_city ?? '',
        dropPincode: r.drop_pincode ?? '',
        itemCount: Number(r.item_count),
        readyAt: new Date(r.ready_at).toISOString(),
      })),
      total: Number(total),
      page,
      limit,
      totalPages: Math.ceil(Number(total) / limit),
    };
  }

  // Decision 0060 rule 1. The group row is locked first, so two admins
  // assigning at once are serialised: the second sees the first's open
  // assignment and gets a 409. The partial unique index is the backstop.
  async assign(adminUserId: string, dto: AssignDeliveryDto): Promise<AdminAssignmentDto> {
    try {
      const id = await this.sequelize.transaction(async (transaction) => {
        const group = await this.lockGroup(dto.orderVendorGroupId, transaction);
        if (group.status !== OrderVendorGroupStatus.READY_FOR_PICKUP) {
          throw new BadRequestException('only a group that is ready for pickup can be assigned');
        }
        assertParentNotLocked(group.orderStatus);
        await this.assertDriverActive(dto.driverId, transaction);
        if (await this.findOpen(group.id, transaction)) {
          throw new ConflictException('this group already has an open delivery assignment');
        }
        const created = await this.assignmentModel.create(
          {
            orderVendorGroupId: group.id,
            driverId: dto.driverId,
            status: DELIVERY_ASSIGNMENT_STATUSES.ASSIGNED,
            attemptNo: 1,
            assignedBy: adminUserId,
            assignedAt: new Date(),
          } as never,
          { transaction },
        );
        return created.id;
      });
      return this.getDto(id);
    } catch (error) {
      throw this.mapOpenAssignmentRace(error);
    }
  }

  // Rule 2: only a job the driver has not picked up yet can change hands.
  async reassign(
    adminUserId: string,
    assignmentId: string,
    driverId: string,
  ): Promise<AdminAssignmentDto> {
    try {
      const id = await this.sequelize.transaction(async (transaction) => {
        const current = await this.assignmentModel.findByPk(assignmentId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!current) {
          throw new NotFoundException(`Delivery assignment ${assignmentId} not found`);
        }
        const group = await this.lockGroup(current.orderVendorGroupId, transaction);
        if (current.status !== DELIVERY_ASSIGNMENT_STATUSES.ASSIGNED) {
          throw new BadRequestException(
            'only an assigned job that is not yet picked up can be reassigned',
          );
        }
        assertParentNotLocked(group.orderStatus);
        if (current.driverId === driverId) {
          throw new BadRequestException('the job is already assigned to this driver');
        }
        await this.assertDriverActive(driverId, transaction);

        await current.update(
          { status: DELIVERY_ASSIGNMENT_STATUSES.CANCELLED, cancelledAt: new Date() },
          { transaction },
        );
        const created = await this.assignmentModel.create(
          {
            orderVendorGroupId: current.orderVendorGroupId,
            driverId,
            status: DELIVERY_ASSIGNMENT_STATUSES.ASSIGNED,
            attemptNo: current.attemptNo,
            assignedBy: adminUserId,
            assignedAt: new Date(),
          } as never,
          { transaction },
        );
        return created.id;
      });
      return this.getDto(id);
    } catch (error) {
      throw this.mapOpenAssignmentRace(error);
    }
  }

  // Rule 7. Goods are assumed still on the truck after a failed attempt (open
  // question 3 with the client), so the new attempt starts already picked up,
  // with a fresh code. Kept in this one method so the rule can change in one
  // place if the client decides goods return to the vendor first.
  async reattempt(
    adminUserId: string,
    groupId: string,
    driverId: string,
  ): Promise<AdminAssignmentDto> {
    const useRealSms = this.configService.get<boolean>('msg91.useSms', false);
    try {
      const { id, orderId, customerId, otp } = await this.sequelize.transaction(
        async (transaction) => {
          const group = await this.lockGroup(groupId, transaction);
          if (group.status !== OrderVendorGroupStatus.DELIVERY_FAILED) {
            throw new BadRequestException('only a group whose delivery failed can be re-attempted');
          }
          assertParentNotLocked(group.orderStatus);
          await this.assertDriverActive(driverId, transaction);
          if (await this.findOpen(group.id, transaction)) {
            throw new ConflictException('this group already has an open delivery assignment');
          }
          const previousAttempts: number = await this.assignmentModel.max('attemptNo', {
            where: { orderVendorGroupId: group.id },
            transaction,
          });
          const now = new Date();
          const deliveryOtp = generateDeliveryOtp(useRealSms);
          const created = await this.assignmentModel.create(
            {
              orderVendorGroupId: group.id,
              driverId,
              status: DELIVERY_ASSIGNMENT_STATUSES.PICKED_UP,
              attemptNo: (previousAttempts ?? 0) + 1,
              assignedBy: adminUserId,
              assignedAt: now,
              pickedUpAt: now,
              deliveryOtp,
              otpAttempts: 0,
            } as never,
            { transaction },
          );
          await this.sequelize.query(
            `UPDATE order_vendor_group SET status = :shipped, updated_at = NOW() WHERE id = :id`,
            {
              replacements: { shipped: OrderVendorGroupStatus.SHIPPED, id: group.id },
              type: QueryTypes.UPDATE,
              transaction,
            },
          );
          return {
            id: created.id,
            orderId: group.orderId,
            customerId: group.customerId,
            otp: deliveryOtp,
          };
        },
      );
      // After commit, and best effort: a failed notification must not undo the attempt.
      await this.notifyQuietly(() =>
        this.notifications.sendOrderStatusChanged(
          customerId,
          orderId,
          OrderVendorGroupStatus.SHIPPED,
        ),
      );
      await this.notifyQuietly(() => this.notifications.sendDeliveryOtp(customerId, orderId, otp));
      return this.getDto(id);
    } catch (error) {
      throw this.mapOpenAssignmentRace(error);
    }
  }

  private async notifyQuietly(send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.logger.warn(`notification failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // The ops board: every assignment, newest first, optionally narrowed by
  // status and driver. Proof photos are signed per row, only on the status
  // they belong to.
  async list(query: AssignmentListQueryDto): Promise<PaginatedResponse<AdminAssignmentDto>> {
    const page = query.page ?? 1;
    const limit = query.pageSize ?? 20;
    const where =
      '(:status::text IS NULL OR a.status = :status::text) AND (:driverId::uuid IS NULL OR a.driver_id = :driverId::uuid)';
    const filters = { status: query.status ?? null, driverId: query.driverId ?? null };
    const rows = await this.queryAssignments(
      where,
      { ...filters, limit, offset: (page - 1) * limit },
      true,
    );
    const [{ total }] = await this.sequelize.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM delivery_assignments a WHERE ${where}`,
      { replacements: filters, type: QueryTypes.SELECT },
    );
    return {
      items: await Promise.all(rows.map((r) => this.toDto(r))),
      total: Number(total),
      page,
      limit,
      totalPages: Math.ceil(Number(total) / limit),
    };
  }

  async getDto(id: string): Promise<AdminAssignmentDto> {
    const rows = await this.queryAssignments('a.id = :id', { id });
    if (rows.length === 0) {
      throw new NotFoundException(`Delivery assignment ${id} not found`);
    }
    return this.toDto(rows[0]);
  }

  // ── helpers ────────────────────────────────────────────────────────────

  // SELECT ... FOR UPDATE on the group row; carries the parent order status.
  private async lockGroup(
    groupId: string,
    transaction: Transaction,
  ): Promise<{
    id: string;
    status: string;
    orderId: string;
    orderStatus: OrderStatus;
    customerId: string;
  }> {
    const rows = await this.sequelize.query<{
      id: string;
      status: string;
      order_id: string;
      order_status: OrderStatus;
      customer_id: string;
    }>(
      `SELECT g.id, g.status, g.order_id, o.status AS order_status, o.customer_id
       FROM order_vendor_group g JOIN orders o ON o.id = g.order_id
       WHERE g.id = :groupId
       FOR UPDATE OF g`,
      { replacements: { groupId }, type: QueryTypes.SELECT, transaction },
    );
    if (rows.length === 0) {
      throw new NotFoundException(`Order group ${groupId} not found`);
    }
    return {
      id: rows[0].id,
      status: rows[0].status,
      orderId: rows[0].order_id,
      orderStatus: rows[0].order_status,
      customerId: rows[0].customer_id,
    };
  }

  private async assertDriverActive(driverId: string, transaction: Transaction): Promise<void> {
    const driver = await this.driverModel.findByPk(driverId, {
      include: [User],
      transaction,
    });
    if (!driver) {
      throw new NotFoundException(`Driver ${driverId} not found`);
    }
    if (!driver.user.isActive) {
      throw new BadRequestException('that driver is deactivated');
    }
  }

  private findOpen(groupId: string, transaction: Transaction) {
    return this.assignmentModel.findOne({
      where: { orderVendorGroupId: groupId, status: OPEN_STATUSES },
      transaction,
    });
  }

  // The unique index fires only if the row lock above was somehow bypassed.
  private mapOpenAssignmentRace(error: unknown): unknown {
    if (error instanceof UniqueConstraintError) {
      return new ConflictException('this group already has an open delivery assignment');
    }
    return error;
  }

  private queryAssignments(where: string, replacements: Record<string, unknown>, paged = false) {
    return this.sequelize.query<AssignmentRow>(
      `SELECT a.id, a.status, a.attempt_no, g.id AS group_id, g.order_id, v.shop_name,
              dr.id AS driver_id, u.name AS driver_name, u.phone AS driver_phone,
              a.assigned_at, a.vendor_handed_over_at, a.picked_up_at, a.delivered_at,
              a.failed_at, a.failure_reason, a.delivery_photo_key, a.failure_photo_key
       FROM delivery_assignments a
       JOIN order_vendor_group g ON g.id = a.order_vendor_group_id
       JOIN vendors v ON v.id = g.vendor_id
       JOIN drivers dr ON dr.id = a.driver_id
       JOIN users u ON u.id = dr.user_id
       WHERE ${where}
       ORDER BY a.assigned_at DESC, a.id ASC
       ${paged ? 'LIMIT :limit OFFSET :offset' : ''}`,
      { replacements, type: QueryTypes.SELECT },
    );
  }

  private signPhoto(key: string | null): Promise<string | null> {
    return key ? this.storage.presignGet(key, PHOTO_PRESIGN_TTL_SECONDS) : Promise.resolve(null);
  }

  private async toDto(r: AssignmentRow): Promise<AdminAssignmentDto> {
    return {
      id: r.id,
      status: r.status,
      attemptNo: r.attempt_no,
      groupId: r.group_id,
      orderId: r.order_id,
      vendorName: r.shop_name,
      driver: { id: r.driver_id, name: r.driver_name, phone: r.driver_phone ?? '' },
      assignedAt: new Date(r.assigned_at).toISOString(),
      vendorHandedOverAt: iso(r.vendor_handed_over_at),
      pickedUpAt: iso(r.picked_up_at),
      deliveredAt: iso(r.delivered_at),
      failedAt: iso(r.failed_at),
      failureReason: r.failure_reason,
      deliveryPhotoViewUrl: await this.signPhoto(
        r.status === DELIVERY_ASSIGNMENT_STATUSES.DELIVERED ? r.delivery_photo_key : null,
      ),
      failurePhotoViewUrl: await this.signPhoto(
        r.status === DELIVERY_ASSIGNMENT_STATUSES.FAILED ? r.failure_photo_key : null,
      ),
    };
  }
}
