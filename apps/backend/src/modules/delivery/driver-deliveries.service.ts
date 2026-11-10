import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { DELIVERY_ASSIGNMENT_STATUSES } from '@golden-abode/types';
import type {
  DeliveryAddressSnapshot,
  DeliveryAssignmentStatus,
  DeliveryFailureReason,
  DeliveryJobDto,
  DriverProfileDto,
} from '@golden-abode/types';
import { NOTIFICATION_SERVICE, NotificationService } from '../notifications/notification.interface';
import { LOCKED_PARENT_ORDER_STATUSES } from '../orders/refund-status';
import { Driver } from './models/driver.model';
import { DeliveryAssignment } from './models/delivery-assignment.model';
import { Vehicle } from './models/vehicle.model';
import { User } from '../users/models/user.model';
import { DeliveryPhotoService } from './delivery-photo.service';

export type DriverJobScope = 'active' | 'history';

const SCOPE_STATUSES: Record<DriverJobScope, DeliveryAssignmentStatus[]> = {
  active: [DELIVERY_ASSIGNMENT_STATUSES.ASSIGNED, DELIVERY_ASSIGNMENT_STATUSES.PICKED_UP],
  history: [DELIVERY_ASSIGNMENT_STATUSES.DELIVERED, DELIVERY_ASSIGNMENT_STATUSES.FAILED],
};

const BLOCKED_REASON = 'This order was refunded or cancelled. Do not deliver it.';

type JobRow = {
  id: string;
  status: DeliveryAssignmentStatus;
  attempt_no: number;
  group_id: string;
  group_status: string;
  order_id: string;
  order_status: string;
  delivery_address_snapshot: DeliveryAddressSnapshot | null;
  shop_name: string;
  vendor_address: string;
  vendor_lat: string | number | null;
  vendor_lng: string | number | null;
  vendor_phone: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  live_line1: string | null;
  live_line2: string | null;
  live_city: string | null;
  live_pincode: string | null;
  live_lat: string | number | null;
  live_lng: string | number | null;
  vendor_handed_over_at: Date | null;
  picked_up_at: Date | null;
  delivered_at: Date | null;
  failed_at: Date | null;
  failure_reason: DeliveryFailureReason | null;
};

type ItemRow = {
  group_id: string;
  id: string;
  name: string;
  quantity: string;
  unit: string | null;
};

const iso = (d: Date | null): string | null => (d ? new Date(d).toISOString() : null);
const num = (v: string | number | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

// The driver app's view of a job. Every method resolves the driver from the
// logged-in user and treats someone else's assignment as not found.
@Injectable()
export class DriverDeliveriesService {
  constructor(
    @InjectModel(DeliveryAssignment) private readonly assignmentModel: typeof DeliveryAssignment,
    @InjectModel(Driver) private readonly driverModel: typeof Driver,
    private readonly sequelize: Sequelize,
    private readonly configService: ConfigService,
    @Inject(NOTIFICATION_SERVICE) private readonly notifications: NotificationService,
    private readonly photos: DeliveryPhotoService,
  ) {}

  async getProfile(userId: string): Promise<DriverProfileDto> {
    const driver = await this.resolveDriver(userId);
    return {
      id: driver.id,
      name: driver.user.name,
      phone: driver.user.phone ?? '',
      helper:
        driver.helperName && driver.helperPhone
          ? { name: driver.helperName, phone: driver.helperPhone }
          : null,
      vehicle: driver.vehicle
        ? { registrationNumber: driver.vehicle.registrationNumber, type: driver.vehicle.type }
        : null,
    };
  }

  async list(userId: string, scope: DriverJobScope): Promise<DeliveryJobDto[]> {
    const driver = await this.resolveDriver(userId);
    return this.loadJobs('a.driver_id = :driverId AND a.status IN (:statuses)', {
      driverId: driver.id,
      statuses: SCOPE_STATUSES[scope],
    });
  }

  async get(userId: string, assignmentId: string): Promise<DeliveryJobDto> {
    const driver = await this.resolveDriver(userId);
    return this.getOwned(driver.id, assignmentId);
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private async resolveDriver(userId: string): Promise<Driver> {
    const driver = await this.driverModel.findOne({
      where: { userId },
      include: [User, Vehicle],
    });
    if (!driver) throw new NotFoundException('No driver profile for this account');
    return driver;
  }

  private async getOwned(driverId: string, assignmentId: string): Promise<DeliveryJobDto> {
    const jobs = await this.loadJobs('a.id = :id AND a.driver_id = :driverId', {
      id: assignmentId,
      driverId,
    });
    if (jobs.length === 0) {
      throw new NotFoundException(`Delivery ${assignmentId} not found`);
    }
    return jobs[0];
  }

  // One join for the jobs, one for all their items.
  private async loadJobs(
    where: string,
    replacements: Record<string, unknown>,
    transaction?: Transaction,
  ): Promise<DeliveryJobDto[]> {
    const rows = await this.sequelize.query<JobRow>(
      `SELECT a.id, a.status, a.attempt_no, a.vendor_handed_over_at, a.picked_up_at,
              a.delivered_at, a.failed_at, a.failure_reason,
              g.id AS group_id, g.status AS group_status, g.order_id,
              o.status AS order_status, o.delivery_address_snapshot,
              v.shop_name, v.address AS vendor_address,
              v.latitude AS vendor_lat, v.longitude AS vendor_lng, vu.phone AS vendor_phone,
              cu.name AS customer_name, cu.phone AS customer_phone,
              ca.address_line_1 AS live_line1, ca.address_line_2 AS live_line2,
              ca.city AS live_city, ca.pincode AS live_pincode,
              ca.lat AS live_lat, ca.lng AS live_lng
       FROM delivery_assignments a
       JOIN order_vendor_group g ON g.id = a.order_vendor_group_id
       JOIN orders o ON o.id = g.order_id
       JOIN vendors v ON v.id = g.vendor_id
       JOIN users vu ON vu.id = v.user_id
       JOIN customers c ON c.id = o.customer_id
       JOIN users cu ON cu.id = c.user_id
       LEFT JOIN customer_addresses ca ON ca.id = o.delivery_address_id
       WHERE ${where}
       ORDER BY a.assigned_at DESC, a.id ASC`,
      { replacements, type: QueryTypes.SELECT, transaction },
    );
    if (rows.length === 0) return [];

    const items = await this.sequelize.query<ItemRow>(
      `SELECT oi.order_vendor_group_id AS group_id, oi.id, mp.name, oi.quantity, u.code AS unit
       FROM order_items oi
       JOIN master_product mp ON mp.id = oi.master_product_id
       LEFT JOIN unit_of_measure u ON u.id = mp.unit_of_measure_id
       WHERE oi.order_vendor_group_id IN (:groupIds)
       ORDER BY oi.created_at ASC, oi.id ASC`,
      {
        replacements: { groupIds: rows.map((r) => r.group_id) },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    return rows.map((r) =>
      this.toDto(
        r,
        items.filter((i) => i.group_id === r.group_id),
      ),
    );
  }

  // Review Focus 4: the drop is the address frozen at checkout; the live
  // address only fills in for orders placed before the snapshot existed.
  private toDto(r: JobRow, items: ItemRow[]): DeliveryJobDto {
    const snap = r.delivery_address_snapshot;
    const open =
      r.status === DELIVERY_ASSIGNMENT_STATUSES.ASSIGNED ||
      r.status === DELIVERY_ASSIGNMENT_STATUSES.PICKED_UP;
    const blocked =
      open &&
      (LOCKED_PARENT_ORDER_STATUSES.some((s) => s === r.order_status) ||
        r.group_status === 'cancelled');
    return {
      id: r.id,
      status: r.status,
      attemptNo: r.attempt_no,
      blocked,
      blockedReason: blocked ? BLOCKED_REASON : null,
      orderId: r.order_id,
      groupId: r.group_id,
      pickup: {
        vendorName: r.shop_name,
        address: r.vendor_address,
        lat: num(r.vendor_lat),
        lng: num(r.vendor_lng),
        phone: r.vendor_phone ?? '',
      },
      drop: {
        recipientName: snap?.recipientName ?? r.customer_name ?? '',
        phone: snap?.recipientPhone ?? r.customer_phone ?? '',
        addressLine1: snap?.addressLine1 ?? r.live_line1 ?? '',
        addressLine2: snap ? snap.addressLine2 : r.live_line2,
        city: snap?.city ?? r.live_city ?? '',
        pincode: snap?.pincode ?? r.live_pincode ?? '',
        lat: snap ? num(snap.lat) : num(r.live_lat),
        lng: snap ? num(snap.lng) : num(r.live_lng),
      },
      items: items.map((i) => ({
        orderItemId: i.id,
        name: i.name,
        quantity: Number(i.quantity),
        unit: i.unit ?? 'unit',
      })),
      vendorHandedOverAt: iso(r.vendor_handed_over_at),
      pickedUpAt: iso(r.picked_up_at),
      deliveredAt: iso(r.delivered_at),
      failedAt: iso(r.failed_at),
      failureReason: r.failure_reason,
    };
  }
}
