import { randomUUID } from 'crypto';
import {
  createPaymentsTestApp,
  PaymentsTestApp,
} from '../../orders/__tests__/payments-test-app';

// Decision 0060 — the one-open-assignment rule is a Postgres partial unique
// index, so it is tested against the real schema.
describe('delivery schema (decision 0060)', () => {
  let t: PaymentsTestApp;

  beforeAll(async () => {
    t = await createPaymentsTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  async function seedDriver(): Promise<string> {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 9);
    const [user] = await t.query<{ id: string }>(
      `INSERT INTO users (id, name, phone, role, is_active, is_approved)
       VALUES (gen_random_uuid(), 'Schema Driver', :phone, 'DRIVER', true, true) RETURNING id`,
      { phone: `6${suffix}` },
    );
    const [driver] = await t.query<{ id: string }>(
      `INSERT INTO drivers (user_id, licence_number) VALUES (:userId, 'DL-TEST-1') RETURNING id`,
      { userId: user.id },
    );
    return driver.id;
  }

  function insertAssignment(groupId: string, driverId: string, status: string) {
    return t.query(
      `INSERT INTO delivery_assignments
         (order_vendor_group_id, driver_id, status, assigned_by, assigned_at)
       VALUES (:groupId, :driverId, :status, :adminId, NOW())`,
      { groupId, driverId, status, adminId: t.adminUserId },
    );
  }

  it('accepts a users row with the DRIVER role', async () => {
    await expect(seedDriver()).resolves.toEqual(expect.any(String));
  });

  it('rejects two open assignments for one group', async () => {
    const o = await t.seedPendingOrder();
    const driverId = await seedDriver();
    await insertAssignment(o.groupId, driverId, 'assigned');
    await expect(insertAssignment(o.groupId, driverId, 'assigned')).rejects.toThrow(
      /uq_delivery_assignment_open/,
    );
    await expect(insertAssignment(o.groupId, driverId, 'picked_up')).rejects.toThrow(
      /uq_delivery_assignment_open/,
    );
  });

  it('allows a cancelled assignment beside an open one', async () => {
    const o = await t.seedPendingOrder();
    const driverId = await seedDriver();
    await insertAssignment(o.groupId, driverId, 'cancelled');
    await expect(insertAssignment(o.groupId, driverId, 'assigned')).resolves.toBeDefined();
  });

  it('stores a delivery address snapshot on an order and allows null', async () => {
    const o = await t.seedPendingOrder();
    const [before] = await t.query<{ delivery_address_snapshot: unknown }>(
      `SELECT delivery_address_snapshot FROM orders WHERE id = :id`,
      { id: o.orderId },
    );
    expect(before.delivery_address_snapshot).toBeNull();
    await t.query(`UPDATE orders SET delivery_address_snapshot = :snap::jsonb WHERE id = :id`, {
      snap: JSON.stringify({ addressLine1: '1 Test Street', city: 'Delhi' }),
      id: o.orderId,
    });
    const [after] = await t.query<{ delivery_address_snapshot: { city: string } }>(
      `SELECT delivery_address_snapshot FROM orders WHERE id = :id`,
      { id: o.orderId },
    );
    expect(after.delivery_address_snapshot.city).toBe('Delhi');
  });
});
