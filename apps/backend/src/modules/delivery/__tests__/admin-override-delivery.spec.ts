import { BadRequestException } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { OrdersService } from '../../orders/orders.service';
import { OrderVendorGroupStatus } from '../../orders/models/order-vendor-group.model';
import { DriverFixture, setupDriverFixture } from './driver-fixture';

jest.setTimeout(60_000);

// Decision 0060 rule 8 and the review of PR #45: the admin override must not
// strand a driver's job, and must lock rows in the same order as the driver
// flow (assignment first, then group) so the two can never deadlock.
describe('admin override and the delivery job', () => {
  let f: DriverFixture;
  let orders: OrdersService;
  let sequelize: Sequelize;

  beforeAll(async () => {
    f = await setupDriverFixture();
    orders = f.t.moduleRef.get(OrdersService);
    sequelize = f.t.moduleRef.get(Sequelize);
  });
  afterAll(async () => {
    await f.close();
  });

  const assignmentStatus = async (id: string) => (await f.row(id)).status;

  it('refuses to force shipped while a driver is assigned but has not picked up', async () => {
    const driver = await f.makeDriver('Test Driver Override Shipped');
    const g = await f.seedGroup({ groupStatus: 'ready_for_pickup' });
    const id = await f.seedAssignment(g.groupId, driver.id, 'assigned');

    await expect(
      orders.adminOverrideVendorGroupStatus(g.groupId, OrderVendorGroupStatus.SHIPPED, 'test'),
    ).rejects.toThrow(BadRequestException);

    // Nothing moved: the job is still usable through the normal pickup.
    expect(await f.groupStatus(g.groupId)).toBe('ready_for_pickup');
    expect(await assignmentStatus(id)).toBe('assigned');
  });

  it('still allows forcing shipped when nobody is assigned', async () => {
    const g = await f.seedGroup({ groupStatus: 'confirmed' });
    await orders.adminOverrideVendorGroupStatus(g.groupId, OrderVendorGroupStatus.SHIPPED, 'test');
    expect(await f.groupStatus(g.groupId)).toBe('shipped');
  });

  it('still allows forcing shipped when the driver already picked up', async () => {
    const driver = await f.makeDriver('Test Driver Override Road');
    const g = await f.seedGroup({ groupStatus: 'delivery_failed' });
    const id = await f.seedAssignment(g.groupId, driver.id, 'picked_up');
    await orders.adminOverrideVendorGroupStatus(g.groupId, OrderVendorGroupStatus.SHIPPED, 'test');
    expect(await f.groupStatus(g.groupId)).toBe('shipped');
    expect(await assignmentStatus(id)).toBe('picked_up');
  });

  // Ported from the mock-based unit tests (decisions 0054 and 0060): same rules,
  // now against the real rows and locks.
  it.each(['refunded', 'refund_required', 'refund_pending'])(
    'refuses to force a group forward under an order that is %s',
    async (orderStatus) => {
      const g = await f.seedGroup({ orderStatus, groupStatus: 'confirmed' });
      await expect(
        orders.adminOverrideVendorGroupStatus(g.groupId, OrderVendorGroupStatus.SHIPPED, 'test'),
      ).rejects.toThrow('cannot override a group whose parent order is refunded');
      expect(await f.groupStatus(g.groupId)).toBe('confirmed');
    },
  );

  it('still allows cancelling a group under a refunded order (the one safe target)', async () => {
    const g = await f.seedGroup({ orderStatus: 'refunded', groupStatus: 'confirmed' });
    const dto = await orders.adminOverrideVendorGroupStatus(
      g.groupId,
      OrderVendorGroupStatus.CANCELLED,
      'cleanup after refund',
    );
    expect(dto.status).toBe('cancelled');
    expect(await f.groupStatus(g.groupId)).toBe('cancelled');
  });

  it.each(['assigned', 'picked_up'])(
    'cancelling a group closes its %s job in the same step',
    async (jobStatus) => {
      const driver = await f.makeDriver('Test Driver Override Cancel');
      const g = await f.seedGroup({
        groupStatus: jobStatus === 'assigned' ? 'ready_for_pickup' : 'shipped',
      });
      const id = await f.seedAssignment(g.groupId, driver.id, jobStatus);
      await orders.adminOverrideVendorGroupStatus(
        g.groupId,
        OrderVendorGroupStatus.CANCELLED,
        'test',
      );
      expect(await f.groupStatus(g.groupId)).toBe('cancelled');
      expect(await assignmentStatus(id)).toBe('cancelled');
      expect((await f.row(id)).cancelled_at).not.toBeNull();
    },
  );

  it('forcing ready_for_pickup leaves an assigned job alone', async () => {
    const driver = await f.makeDriver('Test Driver Override Ready');
    const g = await f.seedGroup({ groupStatus: 'confirmed' });
    const id = await f.seedAssignment(g.groupId, driver.id, 'assigned');
    await orders.adminOverrideVendorGroupStatus(
      g.groupId,
      OrderVendorGroupStatus.READY_FOR_PICKUP,
      'test',
    );
    expect(await f.groupStatus(g.groupId)).toBe('ready_for_pickup');
    expect(await assignmentStatus(id)).toBe('assigned');
  });

  it('sets any status regardless of the current one when no job is open', async () => {
    const g = await f.seedGroup({ groupStatus: 'delivered' });
    const dto = await orders.adminOverrideVendorGroupStatus(
      g.groupId,
      OrderVendorGroupStatus.CONFIRMED,
      'delivered in error',
    );
    expect(dto.status).toBe('confirmed');
  });

  it('locks the open assignment before the group, so it cannot deadlock a driver action', async () => {
    const driver = await f.makeDriver('Test Driver Override Locks');
    const g = await f.seedGroup({ groupStatus: 'ready_for_pickup' });
    const id = await f.seedAssignment(g.groupId, driver.id, 'assigned');

    // A driver-side transaction holds the assignment row, as pickup does.
    const holder = await sequelize.transaction();
    try {
      await sequelize.query('SELECT id FROM delivery_assignments WHERE id = :id FOR UPDATE', {
        replacements: { id },
        type: QueryTypes.SELECT,
        transaction: holder,
      });

      const override = orders.adminOverrideVendorGroupStatus(
        g.groupId,
        OrderVendorGroupStatus.CANCELLED,
        'test',
      );
      await new Promise((r) => setTimeout(r, 500));

      // While the override waits for the assignment, it must not hold the group
      // row: if it did, the driver's next step (lock the group) would deadlock.
      let groupFree = true;
      const probe = await sequelize.transaction();
      try {
        await sequelize.query(
          'SELECT id FROM order_vendor_group WHERE id = :id FOR UPDATE NOWAIT',
          { replacements: { id: g.groupId }, type: QueryTypes.SELECT, transaction: probe },
        );
      } catch {
        groupFree = false;
      } finally {
        await probe.rollback();
      }
      expect(groupFree).toBe(true);

      await holder.commit();
      await override;
    } finally {
      // commit above already closed it on the happy path
      if (!(holder as unknown as { finished?: string }).finished) await holder.rollback();
    }

    expect(await f.groupStatus(g.groupId)).toBe('cancelled');
    expect(await assignmentStatus(id)).toBe('cancelled');
  });
});
