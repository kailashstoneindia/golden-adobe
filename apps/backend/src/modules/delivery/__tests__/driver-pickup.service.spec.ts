import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DriverFixture, setupDriverFixture } from './driver-fixture';

jest.setTimeout(60_000);

describe('DriverDeliveriesService.pickup (decision 0060)', () => {
  let f: DriverFixture;

  beforeAll(async () => {
    f = await setupDriverFixture();
  });
  afterAll(async () => {
    await f.close();
  });

  async function seedAssigned(over: { orderStatus?: string; groupStatus?: string } = {}) {
    const driver = await f.makeDriver('Test Driver Pickup');
    const g = await f.seedGroup(over);
    const id = await f.seedAssignment(g.groupId, driver.id, 'assigned');
    return { driver, g, id };
  }

  // Adds a second item to the group, returning its id.
  async function addSecondItem(itemId: string): Promise<string> {
    const [row] = await f.t.query<{ id: string }>(
      `INSERT INTO order_items (id, order_vendor_group_id, vendor_listing_id, master_product_id,
                                quantity, unit_price_snapshot, created_at, updated_at)
       SELECT gen_random_uuid(), order_vendor_group_id, vendor_listing_id, master_product_id,
              quantity, unit_price_snapshot, NOW(), NOW()
       FROM order_items WHERE id = :i RETURNING id`,
      { i: itemId },
    );
    return row.id;
  }

  async function expectUntouched(id: string, groupId: string, groupWas: string) {
    const r = await f.row(id);
    expect(r.status).toBe('assigned');
    expect(r.picked_up_at).toBeNull();
    expect(r.delivery_otp).toBeNull();
    expect(await f.groupStatus(groupId)).toBe(groupWas);
  }

  it('a full checklist marks the job picked up, ships the group and sets the code', async () => {
    const { driver, g, id } = await seedAssigned();
    f.notifications.calls.length = 0;

    const job = await f.service.pickup(driver.userId, id, [
      { orderItemId: g.itemId, loaded: true },
    ]);

    expect(job).toMatchObject({ id, status: 'picked_up', pickedUpAt: expect.any(String) });
    const r = await f.row(id);
    expect(r.status).toBe('picked_up');
    expect(r.picked_up_at).not.toBeNull();
    expect(r.delivery_otp).toBe('123456');
    expect(r.otp_attempts).toBe(0);
    expect(r.pickup_checklist).toEqual([{ orderItemId: g.itemId, loaded: true }]);
    expect(await f.groupStatus(g.groupId)).toBe('shipped');

    expect(f.notifications.callsTo('sendDeliveryOtp')[0].args).toEqual([
      f.t.customerId,
      g.orderId,
      '123456',
    ]);
    expect(f.notifications.callsTo('sendOrderStatusChanged')[0].args).toEqual([
      f.t.customerId,
      g.orderId,
      'shipped',
    ]);
  });

  it('is refused, changing nothing, when an item is missing, not loaded, unknown or repeated', async () => {
    const { driver, g, id } = await seedAssigned();
    const second = await addSecondItem(g.itemId);
    const bad = [
      [{ orderItemId: g.itemId, loaded: true }], // second item missing
      [
        { orderItemId: g.itemId, loaded: true },
        { orderItemId: second, loaded: false },
      ],
      [
        { orderItemId: g.itemId, loaded: true },
        { orderItemId: '00000000-0000-4000-8000-000000000000', loaded: true },
      ],
      [
        { orderItemId: g.itemId, loaded: true },
        { orderItemId: g.itemId, loaded: true },
      ],
    ];
    for (const items of bad) {
      await expect(f.service.pickup(driver.userId, id, items)).rejects.toThrow(BadRequestException);
      await expectUntouched(id, g.groupId, 'ready_for_pickup');
    }
  });

  it('is refused when the job is not in assigned', async () => {
    const driver = await f.makeDriver('Test Driver Pickup Twice');
    const g = await f.seedGroup({ groupStatus: 'shipped' });
    const id = await f.seedAssignment(g.groupId, driver.id, 'picked_up');
    await expect(
      f.service.pickup(driver.userId, id, [{ orderItemId: g.itemId, loaded: true }]),
    ).rejects.toThrow(BadRequestException);
  });

  it('is refused when the group is not ready for pickup', async () => {
    const { driver, g, id } = await seedAssigned({ groupStatus: 'confirmed' });
    await expect(
      f.service.pickup(driver.userId, id, [{ orderItemId: g.itemId, loaded: true }]),
    ).rejects.toThrow(BadRequestException);
    await expectUntouched(id, g.groupId, 'confirmed');
  });

  it.each(['refunded', 'refund_pending', 'cancelled'])(
    'is refused when the parent order is %s (Review Focus 2)',
    async (orderStatus) => {
      const { driver, g, id } = await seedAssigned({ orderStatus });
      await expect(
        f.service.pickup(driver.userId, id, [{ orderItemId: g.itemId, loaded: true }]),
      ).rejects.toThrow(BadRequestException);
      await expectUntouched(id, g.groupId, 'ready_for_pickup');
      expect(f.notifications.callsTo('sendDeliveryOtp').some((c) => c.args[1] === g.orderId)).toBe(
        false,
      );
    },
  );

  it("404s on another driver's job", async () => {
    const { g, id } = await seedAssigned();
    const stranger = await f.makeDriver('Test Driver Stranger');
    await expect(
      f.service.pickup(stranger.userId, id, [{ orderItemId: g.itemId, loaded: true }]),
    ).rejects.toThrow(NotFoundException);
  });

  it('still succeeds when the notification fails', async () => {
    const { driver, g, id } = await seedAssigned();
    f.notifications.failNext('sendDeliveryOtp');
    const job = await f.service.pickup(driver.userId, id, [
      { orderItemId: g.itemId, loaded: true },
    ]);
    expect(job.status).toBe('picked_up');
  });
});
