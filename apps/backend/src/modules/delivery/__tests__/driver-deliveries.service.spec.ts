import { NotFoundException } from '@nestjs/common';
import { DriverFixture, setupDriverFixture } from './driver-fixture';

jest.setTimeout(60_000);

describe('DriverDeliveriesService profile, list and detail (decision 0060)', () => {
  let f: DriverFixture;

  beforeAll(async () => {
    f = await setupDriverFixture();
  });
  afterAll(async () => {
    await f.close();
  });

  it('getProfile returns the helper and vehicle, or null when there is none', async () => {
    const bare = await f.makeDriver('Test Driver Bare');
    expect(await f.service.getProfile(bare.userId)).toEqual({
      id: bare.id,
      name: 'Test Driver Bare',
      phone: bare.phone,
      helper: null,
      vehicle: null,
    });

    const withKit = await f.makeDriver('Test Driver Kit');
    await f.t.query(
      `UPDATE drivers SET helper_name = 'Helper One', helper_phone = '+919800000001' WHERE id = :id`,
      { id: withKit.id },
    );
    const [veh] = await f.t.query<{ id: string }>(
      `INSERT INTO vehicles (registration_number, type, is_active)
       VALUES ('TEST-DL1-0001', 'Mini truck', true) RETURNING id`,
    );
    await f.t.query(`UPDATE drivers SET vehicle_id = :v WHERE id = :id`, {
      v: veh.id,
      id: withKit.id,
    });
    const profile = await f.service.getProfile(withKit.userId);
    expect(profile.helper).toEqual({ name: 'Helper One', phone: '+919800000001' });
    expect(profile.vehicle).toEqual({ registrationNumber: 'TEST-DL1-0001', type: 'Mini truck' });
    await f.t.query(`UPDATE drivers SET vehicle_id = NULL WHERE id = :id`, { id: withKit.id });
    await f.t.query(`DELETE FROM vehicles WHERE id = :id`, { id: veh.id });
  });

  it('getProfile 404s for a user who is not a driver', async () => {
    await expect(f.service.getProfile(f.t.customerUserId)).rejects.toThrow(NotFoundException);
  });

  it('list(active) returns this driver assigned and picked_up jobs, newest first', async () => {
    const me = await f.makeDriver('Test Driver List Me');
    const other = await f.makeDriver('Test Driver List Other');
    const g1 = await f.seedGroup();
    const g2 = await f.seedGroup();
    const g3 = await f.seedGroup();
    const g4 = await f.seedGroup();
    const older = await f.seedAssignment(g1.groupId, me.id, 'assigned', {
      assignedAt: '2026-01-01T10:00:00Z',
    });
    const newer = await f.seedAssignment(g2.groupId, me.id, 'picked_up', {
      assignedAt: '2026-01-02T10:00:00Z',
    });
    await f.seedAssignment(g3.groupId, me.id, 'delivered');
    await f.seedAssignment(g4.groupId, other.id, 'assigned');

    const jobs = await f.service.list(me.userId, 'active');
    expect(jobs.map((j) => j.id)).toEqual([newer, older]);
  });

  it('list(history) returns delivered and failed jobs only', async () => {
    const me = await f.makeDriver('Test Driver History');
    const ids: Record<string, string> = {};
    for (const status of ['assigned', 'picked_up', 'delivered', 'failed', 'cancelled']) {
      const g = await f.seedGroup();
      ids[status] = await f.seedAssignment(g.groupId, me.id, status);
    }
    const jobs = await f.service.list(me.userId, 'history');
    expect(jobs.map((j) => j.id).sort()).toEqual([ids.delivered, ids.failed].sort());
  });

  it("404s on another driver's assignment and on an unknown id", async () => {
    const mine = await f.makeDriver('Test Driver Mine');
    const theirs = await f.makeDriver('Test Driver Theirs');
    const g = await f.seedGroup();
    const id = await f.seedAssignment(g.groupId, theirs.id, 'assigned');
    await expect(f.service.get(mine.userId, id)).rejects.toThrow(NotFoundException);
    await expect(
      f.service.get(mine.userId, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toThrow(NotFoundException);
    await expect(f.service.get(theirs.userId, id)).resolves.toMatchObject({ id });
  });

  it('the drop uses the address frozen on the order, not the live one (Review Focus 4)', async () => {
    const me = await f.makeDriver('Test Driver Drop');
    const g = await f.seedGroup();
    const id = await f.seedAssignment(g.groupId, me.id, 'assigned');
    await f.t.query(`UPDATE orders SET delivery_address_snapshot = :snap::jsonb WHERE id = :id`, {
      id: g.orderId,
      snap: JSON.stringify({
        label: 'Site',
        addressLine1: '99 Paid Street',
        addressLine2: 'Gate 4',
        city: 'Jaipur',
        pincode: '302001',
        lat: 26.9,
        lng: 75.8,
        recipientName: 'Site Manager',
        recipientPhone: '+919811111111',
      }),
    });
    // The customer then edits the saved address after paying.
    await f.t.query(
      `UPDATE customer_addresses SET address_line_1 = '1 Edited Lane', city = 'Mumbai'
       WHERE customer_id = :c`,
      { c: f.t.customerId },
    );

    const job = await f.service.get(me.userId, id);
    expect(job.drop).toEqual({
      recipientName: 'Site Manager',
      phone: '+919811111111',
      addressLine1: '99 Paid Street',
      addressLine2: 'Gate 4',
      city: 'Jaipur',
      pincode: '302001',
      lat: 26.9,
      lng: 75.8,
    });
  });

  it('the pickup carries the vendor shop name, address and phone; items carry name, quantity and unit', async () => {
    const me = await f.makeDriver('Test Driver Pickup Info');
    const g = await f.seedGroup({ quantity: 3 });
    const id = await f.seedAssignment(g.groupId, me.id, 'assigned');
    await f.t.query(
      `INSERT INTO unit_of_measure (id, code, name) VALUES (gen_random_uuid(), 'TESTU1', 'Test Bag')`,
    );
    await f.t.query(
      `UPDATE master_product SET unit_of_measure_id = (SELECT id FROM unit_of_measure WHERE code = 'TESTU1')
       WHERE id = (SELECT master_product_id FROM order_items WHERE id = :i)`,
      { i: g.itemId },
    );

    const job = await f.service.get(me.userId, id);
    expect(job.pickup).toMatchObject({
      vendorName: 'Payments Test Shop',
      address: '1 Test Street',
      lat: 28.7041,
      lng: 77.1025,
      phone: expect.any(String),
    });
    expect(job.items).toEqual([
      {
        orderItemId: g.itemId,
        name: expect.stringContaining('Payments Widget'),
        quantity: 3,
        unit: 'TESTU1',
      },
    ]);
    expect(job).toMatchObject({
      id,
      status: 'assigned',
      attemptNo: 1,
      orderId: g.orderId,
      groupId: g.groupId,
      blocked: false,
      blockedReason: null,
      deliveredAt: null,
    });
  });

  it.each(['refunded', 'refund_pending', 'cancelled'])(
    'a %s parent order makes an open job blocked with a reason (Review Focus 2)',
    async (orderStatus) => {
      const me = await f.makeDriver('Test Driver Blocked');
      const g = await f.seedGroup({ orderStatus });
      const id = await f.seedAssignment(g.groupId, me.id, 'picked_up');
      const job = await f.service.get(me.userId, id);
      expect(job.blocked).toBe(true);
      expect(job.blockedReason).toEqual(expect.any(String));
    },
  );

  it('a cancelled group blocks an open job; a finished job is never shown as blocked', async () => {
    const me = await f.makeDriver('Test Driver Blocked Two');
    const cancelledGroup = await f.seedGroup({ groupStatus: 'cancelled' });
    const open = await f.seedAssignment(cancelledGroup.groupId, me.id, 'assigned');
    const refunded = await f.seedGroup({ orderStatus: 'refunded', groupStatus: 'delivered' });
    const done = await f.seedAssignment(refunded.groupId, me.id, 'delivered');
    expect((await f.service.get(me.userId, open)).blocked).toBe(true);
    expect((await f.service.get(me.userId, done)).blocked).toBe(false);
  });
});
