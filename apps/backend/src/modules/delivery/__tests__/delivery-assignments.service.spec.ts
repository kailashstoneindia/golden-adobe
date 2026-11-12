import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DeliveryAssignmentsService } from '../delivery-assignments.service';
import { DriversService } from '../drivers.service';
import { createDeliveryTestModule } from './delivery-test-app';
import {
  createPaymentsTestApp,
  PaymentsTestApp,
  RecordingNotifications,
} from '../../orders/__tests__/payments-test-app';
import { NOTIFICATION_SERVICE } from '../../notifications/notification.interface';

jest.setTimeout(60_000);

let phoneSeq = Math.floor(Math.random() * 900000);
const nextPhone = () => `+9197${String(1000000 + phoneSeq++).padStart(8, '0')}`;

// One shared fixture: the payments harness seeds orders and groups, the
// delivery module under test runs the service against the same database.
async function setup() {
  const t = await createPaymentsTestApp();
  const notifications = new RecordingNotifications();
  const d = await createDeliveryTestModule([
    DeliveryAssignmentsService,
    DriversService,
    { provide: NOTIFICATION_SERVICE, useValue: notifications },
  ]);
  const service = d.moduleRef.get(DeliveryAssignmentsService);
  const drivers = d.moduleRef.get(DriversService);

  // A paid order whose vendor group has been marked ready by the vendor.
  async function seedReadyGroup(
    over: { orderStatus?: string; groupStatus?: string; readyAt?: string } = {},
  ) {
    const seeded = await t.seedPendingOrder();
    await t.query(`UPDATE orders SET status = :s WHERE id = :id`, {
      s: over.orderStatus ?? 'confirmed',
      id: seeded.orderId,
    });
    await t.query(`UPDATE order_vendor_group SET status = :s, updated_at = :at WHERE id = :id`, {
      s: over.groupStatus ?? 'ready_for_pickup',
      at: over.readyAt ?? new Date().toISOString(),
      id: seeded.groupId,
    });
    return seeded;
  }

  const makeDriver = (name = 'Test Driver Assign') =>
    drivers.create({
      name,
      phone: nextPhone(),
      licenceNumber: `TEST-${randomUUID().slice(0, 8)}`,
    } as never);

  return {
    t,
    d,
    service,
    drivers,
    notifications,
    seedReadyGroup,
    makeDriver,
    async close() {
      await t.query(
        `DELETE FROM delivery_assignments WHERE order_vendor_group_id IN
           (SELECT g.id FROM order_vendor_group g JOIN orders o ON o.id = g.order_id
            WHERE o.customer_id = :c)`,
        { c: t.customerId },
      );
      // The two harnesses share the static model classes; the payments one
      // cleans up through them, so it closes first.
      await t.close();
      await d.cleanup();
    },
  };
}

describe('DeliveryAssignmentsService.listQueue (decision 0060)', () => {
  let f: Awaited<ReturnType<typeof setup>>;

  beforeAll(async () => {
    f = await setup();
  });
  afterAll(async () => {
    await f.close();
  });

  it('lists a ready group with the vendor, drop and item details', async () => {
    const g = await f.seedReadyGroup();
    const page = await f.service.listQueue({ page: 1, pageSize: 100 });
    const item = page.items.find((i) => i.groupId === g.groupId);
    expect(item).toMatchObject({
      groupId: g.groupId,
      orderId: g.orderId,
      vendorName: 'Payments Test Shop',
      vendorCity: null,
      dropCity: 'Delhi',
      dropPincode: '110001',
      itemCount: 1,
      readyAt: expect.any(String),
    });
  });

  it('leaves out groups that are not ready, already assigned, or under a locked order', async () => {
    const notReady = await f.seedReadyGroup({ groupStatus: 'confirmed' });
    const assigned = await f.seedReadyGroup();
    const locked = await f.seedReadyGroup({ orderStatus: 'refund_pending' });
    const driver = await f.makeDriver();
    await f.t.query(
      `INSERT INTO delivery_assignments
         (order_vendor_group_id, driver_id, status, assigned_by, assigned_at)
       VALUES (:g, :d, 'assigned', :a, NOW())`,
      { g: assigned.groupId, d: driver.id, a: f.t.adminUserId },
    );

    const ids = (await f.service.listQueue({ page: 1, pageSize: 100 })).items.map((i) => i.groupId);
    expect(ids).not.toContain(notReady.groupId);
    expect(ids).not.toContain(assigned.groupId);
    expect(ids).not.toContain(locked.groupId);
  });

  it('shows a group again once its assignment is cancelled', async () => {
    const g = await f.seedReadyGroup();
    const driver = await f.makeDriver();
    await f.t.query(
      `INSERT INTO delivery_assignments
         (order_vendor_group_id, driver_id, status, assigned_by, assigned_at)
       VALUES (:g, :d, 'cancelled', :a, NOW())`,
      { g: g.groupId, d: driver.id, a: f.t.adminUserId },
    );
    const ids = (await f.service.listQueue({ page: 1, pageSize: 100 })).items.map((i) => i.groupId);
    expect(ids).toContain(g.groupId);
  });

  it('orders the oldest ready group first', async () => {
    const newer = await f.seedReadyGroup({ readyAt: '2026-11-09T10:00:00Z' });
    const older = await f.seedReadyGroup({ readyAt: '2026-11-08T10:00:00Z' });
    const ids = (await f.service.listQueue({ page: 1, pageSize: 100 })).items.map((i) => i.groupId);
    expect(ids.indexOf(older.groupId)).toBeLessThan(ids.indexOf(newer.groupId));
  });

  it('cityId limits the queue to that vendor city', async () => {
    const cityId = randomUUID();
    await f.t.query(
      `INSERT INTO city (id, name, slug, state, centroid_lat, centroid_lng, is_active, created_at, updated_at)
       VALUES (:id, 'Test Queue City', :slug, 'Delhi', 28.6, 77.2, true, NOW(), NOW())`,
      { id: cityId, slug: `test-queue-${cityId.slice(0, 8)}` },
    );
    try {
      const g = await f.seedReadyGroup();
      const [{ vendor_id }] = await f.t.query<{ vendor_id: string }>(
        `SELECT vendor_id FROM order_vendor_group WHERE id = :id`,
        { id: g.groupId },
      );
      await f.t.query(`UPDATE vendors SET city_id = :c WHERE id = :v`, { c: cityId, v: vendor_id });

      const inCity = await f.service.listQueue({ page: 1, pageSize: 100, cityId });
      expect(inCity.items.map((i) => i.groupId)).toContain(g.groupId);
      expect(inCity.items[0].vendorCity).toBe('Test Queue City');

      const elsewhere = await f.service.listQueue({ page: 1, pageSize: 100, cityId: randomUUID() });
      expect(elsewhere.items).toHaveLength(0);
    } finally {
      await f.t.query(`UPDATE vendors SET city_id = NULL WHERE city_id = :c`, { c: cityId });
      await f.t.query(`DELETE FROM city WHERE id = :c`, { c: cityId });
    }
  });

  it('prefers the address frozen on the order over the live address', async () => {
    const g = await f.seedReadyGroup();
    await f.t.query(`UPDATE orders SET delivery_address_snapshot = :s::jsonb WHERE id = :id`, {
      s: JSON.stringify({ city: 'Jaipur', pincode: '302001', addressLine1: 'x' }),
      id: g.orderId,
    });
    const item = (await f.service.listQueue({ page: 1, pageSize: 100 })).items.find(
      (i) => i.groupId === g.groupId,
    );
    expect(item).toMatchObject({ dropCity: 'Jaipur', dropPincode: '302001' });
  });
});

describe('DeliveryAssignmentsService assign and reassign (decision 0060)', () => {
  let f: Awaited<ReturnType<typeof setup>>;

  beforeAll(async () => {
    f = await setup();
  });
  afterAll(async () => {
    await f.close();
  });

  const openRows = (groupId: string) =>
    f.t.query<{ id: string; status: string; driver_id: string }>(
      `SELECT id, status, driver_id FROM delivery_assignments
       WHERE order_vendor_group_id = :g AND status IN ('assigned','picked_up')`,
      { g: groupId },
    );

  it('creates an assigned job for a ready group, recording who assigned it', async () => {
    const g = await f.seedReadyGroup();
    const driver = await f.makeDriver('Test Driver Alpha');

    const dto = await f.service.assign(f.t.adminUserId, {
      orderVendorGroupId: g.groupId,
      driverId: driver.id,
    });

    expect(dto).toMatchObject({
      status: 'assigned',
      attemptNo: 1,
      groupId: g.groupId,
      orderId: g.orderId,
      vendorName: 'Payments Test Shop',
      driver: { id: driver.id, name: 'Test Driver Alpha', phone: driver.phone },
      pickedUpAt: null,
    });
    const [row] = await f.t.query<{ assigned_by: string }>(
      `SELECT assigned_by FROM delivery_assignments WHERE id = :id`,
      { id: dto.id },
    );
    expect(row.assigned_by).toBe(f.t.adminUserId);
  });

  it('404s on an unknown group or driver', async () => {
    const g = await f.seedReadyGroup();
    const driver = await f.makeDriver();
    const unknown = '00000000-0000-4000-8000-000000000000';
    await expect(
      f.service.assign(f.t.adminUserId, { orderVendorGroupId: unknown, driverId: driver.id }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      f.service.assign(f.t.adminUserId, { orderVendorGroupId: g.groupId, driverId: unknown }),
    ).rejects.toThrow(NotFoundException);
  });

  it('400s when the group is not ready for pickup', async () => {
    const g = await f.seedReadyGroup({ groupStatus: 'confirmed' });
    const driver = await f.makeDriver();
    await expect(
      f.service.assign(f.t.adminUserId, { orderVendorGroupId: g.groupId, driverId: driver.id }),
    ).rejects.toThrow(BadRequestException);
  });

  it('400s for an inactive driver and for a locked parent order', async () => {
    const g = await f.seedReadyGroup();
    const locked = await f.seedReadyGroup({ orderStatus: 'refunded' });
    const driver = await f.makeDriver();
    const gone = await f.makeDriver();
    await f.t.query(`UPDATE users SET is_active = false WHERE id = :id`, { id: gone.userId });

    await expect(
      f.service.assign(f.t.adminUserId, { orderVendorGroupId: g.groupId, driverId: gone.id }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      f.service.assign(f.t.adminUserId, {
        orderVendorGroupId: locked.groupId,
        driverId: driver.id,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('409s when the group already has an open assignment', async () => {
    const g = await f.seedReadyGroup();
    const a = await f.makeDriver();
    const b = await f.makeDriver();
    await f.service.assign(f.t.adminUserId, { orderVendorGroupId: g.groupId, driverId: a.id });
    await expect(
      f.service.assign(f.t.adminUserId, { orderVendorGroupId: g.groupId, driverId: b.id }),
    ).rejects.toThrow(ConflictException);
  });

  it('two admins assigning the same group at once: one wins, one gets 409', async () => {
    const g = await f.seedReadyGroup();
    const a = await f.makeDriver();
    const b = await f.makeDriver();

    const results = await Promise.allSettled([
      f.service.assign(f.t.adminUserId, { orderVendorGroupId: g.groupId, driverId: a.id }),
      f.service.assign(f.t.adminUserId, { orderVendorGroupId: g.groupId, driverId: b.id }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(await openRows(g.groupId)).toHaveLength(1);
  });

  it('reassigns an assigned job: old one cancelled, new one open for the new driver', async () => {
    const g = await f.seedReadyGroup();
    const a = await f.makeDriver();
    const b = await f.makeDriver();
    const first = await f.service.assign(f.t.adminUserId, {
      orderVendorGroupId: g.groupId,
      driverId: a.id,
    });

    const second = await f.service.reassign(f.t.adminUserId, first.id, b.id);

    expect(second).toMatchObject({ status: 'assigned', driver: { id: b.id }, groupId: g.groupId });
    expect(second.id).not.toBe(first.id);
    const [old] = await f.t.query<{ status: string; cancelled_at: Date | null }>(
      `SELECT status, cancelled_at FROM delivery_assignments WHERE id = :id`,
      { id: first.id },
    );
    expect(old.status).toBe('cancelled');
    expect(old.cancelled_at).not.toBeNull();
    const open = await openRows(g.groupId);
    expect(open).toHaveLength(1);
    expect(open[0].driver_id).toBe(b.id);
  });

  it('refuses to reassign a job that is already picked up', async () => {
    const g = await f.seedReadyGroup();
    const a = await f.makeDriver();
    const b = await f.makeDriver();
    const first = await f.service.assign(f.t.adminUserId, {
      orderVendorGroupId: g.groupId,
      driverId: a.id,
    });
    await f.t.query(`UPDATE delivery_assignments SET status = 'picked_up' WHERE id = :id`, {
      id: first.id,
    });

    await expect(f.service.reassign(f.t.adminUserId, first.id, b.id)).rejects.toThrow(
      BadRequestException,
    );
    expect((await openRows(g.groupId))[0].id).toBe(first.id);
  });

  it('reassign 404s on an unknown job and 400s for an inactive driver', async () => {
    const g = await f.seedReadyGroup();
    const a = await f.makeDriver();
    const gone = await f.makeDriver();
    await f.t.query(`UPDATE users SET is_active = false WHERE id = :id`, { id: gone.userId });
    const first = await f.service.assign(f.t.adminUserId, {
      orderVendorGroupId: g.groupId,
      driverId: a.id,
    });

    await expect(
      f.service.reassign(f.t.adminUserId, '00000000-0000-4000-8000-000000000000', a.id),
    ).rejects.toThrow(NotFoundException);
    await expect(f.service.reassign(f.t.adminUserId, first.id, gone.id)).rejects.toThrow(
      BadRequestException,
    );
    expect((await openRows(g.groupId))[0].id).toBe(first.id);
  });

  it('assign tells the driver about the new job', async () => {
    const g = await f.seedReadyGroup();
    const driver = await f.makeDriver();
    f.notifications.calls.length = 0;

    const dto = await f.service.assign(f.t.adminUserId, {
      orderVendorGroupId: g.groupId,
      driverId: driver.id,
    });

    expect(f.notifications.callsTo('sendDeliveryAssigned').map((c) => c.args)).toEqual([
      [driver.userId, dto.id],
    ]);
  });

  it('reassign tells only the new driver, with the new job id', async () => {
    const g = await f.seedReadyGroup();
    const a = await f.makeDriver();
    const b = await f.makeDriver();
    const first = await f.service.assign(f.t.adminUserId, {
      orderVendorGroupId: g.groupId,
      driverId: a.id,
    });
    f.notifications.calls.length = 0;

    const second = await f.service.reassign(f.t.adminUserId, first.id, b.id);

    expect(f.notifications.callsTo('sendDeliveryAssigned').map((c) => c.args)).toEqual([
      [b.userId, second.id],
    ]);
  });

  it('a failed notification does not undo the assignment', async () => {
    const g = await f.seedReadyGroup();
    const driver = await f.makeDriver();
    f.notifications.failNext('sendDeliveryAssigned');

    const dto = await f.service.assign(f.t.adminUserId, {
      orderVendorGroupId: g.groupId,
      driverId: driver.id,
    });

    expect(dto.status).toBe('assigned');
    expect(await openRows(g.groupId)).toHaveLength(1);
  });

  it('a rejected assignment sends no notification', async () => {
    const g = await f.seedReadyGroup({ groupStatus: 'confirmed' });
    const driver = await f.makeDriver();
    f.notifications.calls.length = 0;

    await expect(
      f.service.assign(f.t.adminUserId, { orderVendorGroupId: g.groupId, driverId: driver.id }),
    ).rejects.toThrow(BadRequestException);

    expect(f.notifications.callsTo('sendDeliveryAssigned')).toHaveLength(0);
  });
});

describe('DeliveryAssignmentsService.reattempt (decision 0060 rule 7)', () => {
  let f: Awaited<ReturnType<typeof setup>>;

  beforeAll(async () => {
    f = await setup();
  });
  afterAll(async () => {
    await f.close();
  });

  // A group whose first delivery attempt failed.
  async function seedFailedGroup(over: { orderStatus?: string; groupStatus?: string } = {}) {
    const g = await f.seedReadyGroup({
      groupStatus: over.groupStatus ?? 'delivery_failed',
      orderStatus: over.orderStatus,
    });
    const first = await f.makeDriver();
    await f.t.query(
      `INSERT INTO delivery_assignments
         (order_vendor_group_id, driver_id, status, attempt_no, assigned_by, assigned_at,
          picked_up_at, delivery_otp, failed_at, failure_reason)
       VALUES (:g, :d, 'failed', 1, :a, NOW(), NOW(), '123456', NOW(), 'customer_unavailable')`,
      { g: g.groupId, d: first.id, a: f.t.adminUserId },
    );
    return g;
  }

  it('creates a picked-up attempt with a fresh code and puts the group back on the road', async () => {
    const g = await seedFailedGroup();
    const driver = await f.makeDriver('Test Driver Retry');

    const dto = await f.service.reattempt(f.t.adminUserId, g.groupId, driver.id);

    expect(dto).toMatchObject({
      status: 'picked_up',
      attemptNo: 2,
      driver: { id: driver.id },
      groupId: g.groupId,
    });
    expect(dto.pickedUpAt).not.toBeNull();

    const [row] = await f.t.query<{
      delivery_otp: string;
      otp_attempts: number;
      assigned_by: string;
    }>(`SELECT delivery_otp, otp_attempts, assigned_by FROM delivery_assignments WHERE id = :id`, {
      id: dto.id,
    });
    expect(row).toMatchObject({
      delivery_otp: '123456',
      otp_attempts: 0,
      assigned_by: f.t.adminUserId,
    });

    const [group] = await f.t.query<{ status: string }>(
      `SELECT status FROM order_vendor_group WHERE id = :id`,
      { id: g.groupId },
    );
    expect(group.status).toBe('shipped');
  });

  it('tells the customer the group is shipped and sends the new code', async () => {
    const g = await seedFailedGroup();
    const driver = await f.makeDriver();
    f.notifications.calls.length = 0;

    await f.service.reattempt(f.t.adminUserId, g.groupId, driver.id);

    expect(f.notifications.callsTo('sendOrderStatusChanged')[0].args).toEqual([
      f.t.customerId,
      g.orderId,
      'shipped',
    ]);
    expect(f.notifications.callsTo('sendDeliveryOtp')[0].args).toEqual([
      f.t.customerId,
      g.orderId,
      '123456',
    ]);
  });

  it('counts attempts on from the highest earlier one', async () => {
    const g = await seedFailedGroup();
    const driver = await f.makeDriver();
    const second = await f.service.reattempt(f.t.adminUserId, g.groupId, driver.id);
    await f.t.query(`UPDATE delivery_assignments SET status = 'failed' WHERE id = :id`, {
      id: second.id,
    });
    await f.t.query(`UPDATE order_vendor_group SET status = 'delivery_failed' WHERE id = :id`, {
      id: g.groupId,
    });

    const third = await f.service.reattempt(f.t.adminUserId, g.groupId, driver.id);
    expect(third.attemptNo).toBe(3);
  });

  it.each(['confirmed', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled'])(
    'refuses a group in status %s',
    async (groupStatus) => {
      const g = await seedFailedGroup({ groupStatus });
      const driver = await f.makeDriver();
      await expect(f.service.reattempt(f.t.adminUserId, g.groupId, driver.id)).rejects.toThrow(
        BadRequestException,
      );
    },
  );

  it('refuses a locked parent order and an inactive driver, changing nothing', async () => {
    const locked = await seedFailedGroup({ orderStatus: 'refund_required' });
    const ok = await seedFailedGroup();
    const driver = await f.makeDriver();
    const gone = await f.makeDriver();
    await f.t.query(`UPDATE users SET is_active = false WHERE id = :id`, { id: gone.userId });

    await expect(f.service.reattempt(f.t.adminUserId, locked.groupId, driver.id)).rejects.toThrow(
      BadRequestException,
    );
    await expect(f.service.reattempt(f.t.adminUserId, ok.groupId, gone.id)).rejects.toThrow(
      BadRequestException,
    );
    const [group] = await f.t.query<{ status: string }>(
      `SELECT status FROM order_vendor_group WHERE id = :id`,
      { id: ok.groupId },
    );
    expect(group.status).toBe('delivery_failed');
  });
});

describe('DeliveryAssignmentsService.list (decision 0060 board)', () => {
  let f: Awaited<ReturnType<typeof setup>>;

  beforeAll(async () => {
    f = await setup();
  });
  afterAll(async () => {
    await f.close();
  });

  async function seedAssignment(
    driverId: string,
    status: string,
    extra: { deliveryPhotoKey?: string; failurePhotoKey?: string } = {},
  ) {
    const g = await f.seedReadyGroup({ groupStatus: 'shipped' });
    const [row] = await f.t.query<{ id: string }>(
      `INSERT INTO delivery_assignments
         (order_vendor_group_id, driver_id, status, assigned_by, assigned_at, picked_up_at,
          delivery_otp, delivered_at, delivery_photo_key, failed_at, failure_reason, failure_photo_key)
       VALUES (:g, :d, :s, :a, NOW(), NOW(), '123456',
          CASE WHEN :s = 'delivered' THEN NOW() END, :dp,
          CASE WHEN :s = 'failed' THEN NOW() END,
          CASE WHEN :s = 'failed' THEN 'customer_unavailable' END, :fp)
       RETURNING id`,
      {
        g: g.groupId,
        d: driverId,
        s: status,
        a: f.t.adminUserId,
        dp: extra.deliveryPhotoKey ?? null,
        fp: extra.failurePhotoKey ?? null,
      },
    );
    return row.id;
  }

  it('filters by status and by driver', async () => {
    const d1 = await f.makeDriver('Test Driver Board A');
    const d2 = await f.makeDriver('Test Driver Board B');
    const a1 = await seedAssignment(d1.id, 'picked_up');
    const a2 = await seedAssignment(d2.id, 'picked_up');
    const a3 = await seedAssignment(d1.id, 'delivered', { deliveryPhotoKey: 'k/d.jpg' });

    const byDriver = await f.service.list({ driverId: d1.id, page: 1, pageSize: 100 });
    expect(byDriver.items.map((i) => i.id).sort()).toEqual([a1, a3].sort());

    const byStatus = await f.service.list({
      status: 'picked_up',
      driverId: d2.id,
      page: 1,
      pageSize: 100,
    });
    expect(byStatus.items.map((i) => i.id)).toEqual([a2]);
    expect(byStatus.items[0].driver).toMatchObject({ id: d2.id, name: 'Test Driver Board B' });
  });

  it('filters by order, so the order modal sees every attempt on that order and nothing else', async () => {
    const d = await f.makeDriver('Test Driver Board Order');
    const first = await seedAssignment(d.id, 'failed', { failurePhotoKey: 'delivery/f1.jpg' });
    const other = await seedAssignment(d.id, 'picked_up');
    const [{ order_id: orderId }] = await f.t.query<{ order_id: string }>(
      `SELECT g.order_id FROM delivery_assignments a
       JOIN order_vendor_group g ON g.id = a.order_vendor_group_id WHERE a.id = :id`,
      { id: first },
    );
    // A second attempt on the same group as `first`.
    await f.t.query(
      `INSERT INTO delivery_assignments
         (order_vendor_group_id, driver_id, status, attempt_no, assigned_by, assigned_at, picked_up_at, delivery_otp)
       SELECT order_vendor_group_id, driver_id, 'picked_up', 2, assigned_by, NOW(), NOW(), '123456'
       FROM delivery_assignments WHERE id = :id`,
      { id: first },
    );

    const page = await f.service.list({ orderId, page: 1, pageSize: 100 });

    expect(page.total).toBe(2);
    expect(page.items.map((i) => i.attemptNo).sort()).toEqual([1, 2]);
    expect(page.items.every((i) => i.orderId === orderId)).toBe(true);
    expect(page.items.map((i) => i.id)).not.toContain(other);
  });

  it('pages the results with the repo paginated shape', async () => {
    const d = await f.makeDriver('Test Driver Board Page');
    await seedAssignment(d.id, 'assigned');
    await seedAssignment(d.id, 'assigned');
    await seedAssignment(d.id, 'assigned');

    const p1 = await f.service.list({ driverId: d.id, page: 1, pageSize: 2 });
    const p2 = await f.service.list({ driverId: d.id, page: 2, pageSize: 2 });
    expect(p1).toMatchObject({ total: 3, page: 1, limit: 2, totalPages: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p2.items).toHaveLength(1);
  });

  it('signs the delivery photo only for delivered rows and the failure photo only for failed rows', async () => {
    const d = await f.makeDriver('Test Driver Board Photo');
    const delivered = await seedAssignment(d.id, 'delivered', {
      deliveryPhotoKey: 'delivery/proof.jpg',
      failurePhotoKey: 'ignored/stale.jpg',
    });
    const failed = await seedAssignment(d.id, 'failed', { failurePhotoKey: 'delivery/fail.jpg' });
    const open = await seedAssignment(d.id, 'picked_up', {
      deliveryPhotoKey: 'delivery/early.jpg',
    });

    const { items } = await f.service.list({ driverId: d.id, page: 1, pageSize: 100 });
    const byId = (id: string) => items.find((i) => i.id === id)!;
    expect(byId(delivered).deliveryPhotoViewUrl).toContain('delivery/proof.jpg');
    expect(byId(delivered).failurePhotoViewUrl).toBeNull();
    expect(byId(failed).failurePhotoViewUrl).toContain('delivery/fail.jpg');
    expect(byId(failed).deliveryPhotoViewUrl).toBeNull();
    expect(byId(open).deliveryPhotoViewUrl).toBeNull();
    expect(byId(open).failurePhotoViewUrl).toBeNull();
  });
});
