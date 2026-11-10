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
