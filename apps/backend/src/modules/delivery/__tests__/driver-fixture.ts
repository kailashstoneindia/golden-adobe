import { randomUUID } from 'crypto';
import { DeliveryAssignmentsService } from '../delivery-assignments.service';
import { DeliveryPhotoService } from '../delivery-photo.service';
import { DriverDeliveriesService } from '../driver-deliveries.service';
import { DriversService } from '../drivers.service';
import { VendorHandoverService } from '../vendor-handover.service';
import { createDeliveryTestModule } from './delivery-test-app';
import { createPaymentsTestApp } from '../../orders/__tests__/payments-test-app';
import { NOTIFICATION_SERVICE } from '../../notifications/notification.interface';

let phoneSeq = Math.floor(Math.random() * 900000);
const nextPhone = () => `+9196${String(1000000 + phoneSeq++).padStart(8, '0')}`;

// Shared by the S5 driver specs: the payments harness seeds orders and
// groups, the delivery module under test runs against the same database.
export async function setupDriverFixture() {
  const t = await createPaymentsTestApp();
  const notificationsLog = t.notifications;
  const d = await createDeliveryTestModule([
    DeliveryAssignmentsService,
    DriversService,
    DeliveryPhotoService,
    DriverDeliveriesService,
    VendorHandoverService,
    { provide: NOTIFICATION_SERVICE, useValue: notificationsLog },
  ]);
  const service = d.moduleRef.get(DriverDeliveriesService);
  const drivers = d.moduleRef.get(DriversService);

  async function seedGroup(
    over: { orderStatus?: string; groupStatus?: string; quantity?: number } = {},
  ) {
    const seeded = await t.seedPendingOrder({ quantity: over.quantity });
    await t.query(`UPDATE orders SET status = :s WHERE id = :id`, {
      s: over.orderStatus ?? 'confirmed',
      id: seeded.orderId,
    });
    await t.query(`UPDATE order_vendor_group SET status = :s WHERE id = :id`, {
      s: over.groupStatus ?? 'ready_for_pickup',
      id: seeded.groupId,
    });
    const [item] = await t.query<{ id: string }>(
      `SELECT id FROM order_items WHERE order_vendor_group_id = :g`,
      { g: seeded.groupId },
    );
    return { ...seeded, itemId: item.id };
  }

  const makeDriver = (name = 'Test Driver Job') =>
    drivers.create({
      name,
      phone: nextPhone(),
      licenceNumber: `TEST-${randomUUID().slice(0, 8)}`,
    } as never);

  async function seedAssignment(
    groupId: string,
    driverId: string,
    status: string,
    extra: { otp?: string; attempts?: number; assignedAt?: string } = {},
  ) {
    const [row] = await t.query<{ id: string }>(
      `INSERT INTO delivery_assignments
         (order_vendor_group_id, driver_id, status, assigned_by, assigned_at, picked_up_at,
          delivery_otp, otp_attempts)
       VALUES (:g, :d, :s, :a, COALESCE(:at::timestamptz, NOW()),
          CASE WHEN :s = 'assigned' THEN NULL ELSE NOW() END, :otp, :n)
       RETURNING id`,
      {
        g: groupId,
        d: driverId,
        s: status,
        a: t.adminUserId,
        at: extra.assignedAt ?? null,
        otp: extra.otp ?? (status === 'assigned' ? null : '123456'),
        n: extra.attempts ?? 0,
      },
    );
    return row.id;
  }

  const row = async (assignmentId: string) =>
    (
      await t.query<Record<string, unknown>>(`SELECT * FROM delivery_assignments WHERE id = :id`, {
        id: assignmentId,
      })
    )[0];

  const groupStatus = async (groupId: string) =>
    (
      await t.query<{ status: string }>(`SELECT status FROM order_vendor_group WHERE id = :id`, {
        id: groupId,
      })
    )[0].status;

  return {
    t,
    d,
    service,
    drivers,
    notifications: notificationsLog,
    storage: d.storage,
    seedGroup,
    makeDriver,
    seedAssignment,
    row,
    groupStatus,
    async close() {
      await t.query(
        `DELETE FROM delivery_assignments WHERE order_vendor_group_id IN
           (SELECT g.id FROM order_vendor_group g JOIN orders o ON o.id = g.order_id
            WHERE o.customer_id = :c)`,
        { c: t.customerId },
      );
      // The payments harness cleans up through the shared model classes, so it closes first.
      await t.close();
      await d.cleanup();
    },
  };
}

export type DriverFixture = Awaited<ReturnType<typeof setupDriverFixture>>;
