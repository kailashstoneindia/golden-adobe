import { BadRequestException, ConflictException } from '@nestjs/common';
import { DELIVERY_OTP_MAX_ATTEMPTS } from '@golden-abode/types';
import { Vehicle } from '../models/vehicle.model';
import { DeliveryAssignmentsService } from '../delivery-assignments.service';
import { VendorHandoverService } from '../vendor-handover.service';
import { DriverFixture, setupDriverFixture } from './driver-fixture';

jest.setTimeout(60_000);

// Findings from the review of PR #45, each pinned against the real database.
describe('delivery review fixes', () => {
  let f: DriverFixture;
  let assignments: DeliveryAssignmentsService;
  let handovers: VendorHandoverService;

  beforeAll(async () => {
    f = await setupDriverFixture();
    assignments = f.d.moduleRef.get(DeliveryAssignmentsService);
    handovers = f.d.moduleRef.get(VendorHandoverService);
  });
  afterAll(async () => {
    await f.close();
  });

  const vendorOf = async (groupId: string) =>
    (
      await f.t.query<{ vendor_id: string }>(
        'SELECT vendor_id FROM order_vendor_group WHERE id = :id',
        { id: groupId },
      )
    )[0].vendor_id;

  describe('reassign keeps the vendor handover record (finding 6)', () => {
    it('the replacement job carries the timestamp and the photo', async () => {
      const a = await f.makeDriver('Test Driver Reassign From');
      const b = await f.makeDriver('Test Driver Reassign To');
      const g = await f.seedGroup({ groupStatus: 'ready_for_pickup' });
      const id = await f.seedAssignment(g.groupId, a.id, 'assigned');
      const photo = `delivery/${g.groupId}/handover-test.jpg`;
      await f.t.query(
        `UPDATE delivery_assignments
            SET vendor_handed_over_at = '2026-11-12T10:00:00Z', vendor_handover_photo_key = :photo
          WHERE id = :id`,
        { id, photo },
      );

      const created = await assignments.reassign(f.t.adminUserId, id, b.id);

      const row = await f.row(created.id);
      expect(new Date(row.vendor_handed_over_at as string).toISOString()).toBe(
        '2026-11-12T10:00:00.000Z',
      );
      expect(row.vendor_handover_photo_key).toBe(photo);
      expect(created.vendorHandedOverAt).toBe('2026-11-12T10:00:00.000Z');
    });
  });

  describe('vendor handover under a locked order (finding 6)', () => {
    it.each(['refunded', 'refund_required', 'cancelled'])(
      'is refused when the order is %s',
      async (orderStatus) => {
        const driver = await f.makeDriver('Test Driver Locked Handover');
        const g = await f.seedGroup({ orderStatus, groupStatus: 'ready_for_pickup' });
        await f.seedAssignment(g.groupId, driver.id, 'assigned');

        await expect(
          handovers.markHandedOver(await vendorOf(g.groupId), g.groupId),
        ).rejects.toThrow(BadRequestException);
        const [row] = await f.t.query<{ vendor_handed_over_at: string | null }>(
          'SELECT vendor_handed_over_at FROM delivery_assignments WHERE order_vendor_group_id = :g',
          { g: g.groupId },
        );
        expect(row.vendor_handed_over_at).toBeNull();
      },
    );
  });

  describe('one vehicle per driver is enforced by the database (finding 5)', () => {
    const makeVehicle = () =>
      Vehicle.create({
        registrationNumber: `TEST-UV-${Math.random().toString(36).slice(2, 8)}`,
        type: 'Mini truck',
      } as never);

    it('refuses a second driver on the same vehicle', async () => {
      const vehicle = await makeVehicle();
      const first = await f.makeDriver('Test Driver Vehicle One');
      const second = await f.makeDriver('Test Driver Vehicle Two');
      await f.t.query('UPDATE drivers SET vehicle_id = :v WHERE id = :d', {
        v: vehicle.id,
        d: first.id,
      });
      await expect(
        f.t.query('UPDATE drivers SET vehicle_id = :v WHERE id = :d', {
          v: vehicle.id,
          d: second.id,
        }),
      ).rejects.toThrow(/unique|duplicate/i);
    });

    it('two admins racing for one vehicle: one wins, the other gets a 409, not a 500', async () => {
      const vehicle = await makeVehicle();
      const make = (name: string, n: number) =>
        f.drivers.create({
          name,
          phone: `+9197${String(Math.floor(Math.random() * 9000000) + 1000000 + n)}`,
          licenceNumber: `TEST-RACE-${Math.random().toString(36).slice(2, 8)}`,
          vehicleId: vehicle.id,
        } as never);
      const results = await Promise.allSettled([
        make('Test Driver Race A', 1),
        make('Test Driver Race B', 2),
      ]);
      const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0].reason).toBeInstanceOf(ConflictException);
    });
  });

  describe('driver search matches text literally (finding 8)', () => {
    it('an underscore or percent in the search does not act as a wildcard', async () => {
      const tag = Math.random().toString(36).slice(2, 7);
      await f.makeDriver(`Test Lit_${tag} Under`);
      await f.makeDriver(`Test LitX${tag} Plain`);
      await f.makeDriver(`Test Lit%${tag} Percent`);

      const names = async (search: string) =>
        (await f.drivers.list({ search, limit: 100 } as never)).items.map((d) => d.name);

      expect(await names(`Lit_${tag}`)).toEqual([`Test Lit_${tag} Under`]);
      expect(await names(`Lit%${tag}`)).toEqual([`Test Lit%${tag} Percent`]);
    });
  });

  describe('which attempt may be re-attempted (finding 4)', () => {
    it('only the latest failed attempt of a failed group can, and a recovered group cannot', async () => {
      const driver = await f.makeDriver('Test Driver Reattempt Flags');
      const g = await f.seedGroup({ groupStatus: 'delivery_failed' });
      const first = await f.seedAssignment(g.groupId, driver.id, 'picked_up');
      await f.t.query(
        `UPDATE delivery_assignments SET status = 'failed', failed_at = NOW() WHERE id = :id`,
        { id: first },
      );

      const flags = async () => {
        const { items } = await assignments.list({
          orderId: g.orderId,
          status: 'failed',
          page: 1,
          pageSize: 50,
        } as never);
        return items.map((i) => [i.attemptNo, i.canReattempt]).sort();
      };
      expect(await flags()).toEqual([[1, true]]);

      // Ops re-attempt, and the new attempt fails too: only attempt 2 may be retried.
      await f.t.query(`UPDATE order_vendor_group SET status = 'shipped' WHERE id = :g`, {
        g: g.groupId,
      });
      const second = await f.seedAssignment(g.groupId, driver.id, 'picked_up');
      await f.t.query(
        `UPDATE delivery_assignments SET attempt_no = 2, status = 'failed', failed_at = NOW() WHERE id = :id`,
        { id: second },
      );
      await f.t.query(`UPDATE order_vendor_group SET status = 'delivery_failed' WHERE id = :g`, {
        g: g.groupId,
      });
      expect(await flags()).toEqual([
        [1, false],
        [2, true],
      ]);

      // Delivered after a re-attempt: nothing can be retried any more.
      await f.t.query(`UPDATE order_vendor_group SET status = 'delivered' WHERE id = :g`, {
        g: g.groupId,
      });
      expect(await flags()).toEqual([
        [1, false],
        [2, false],
      ]);
    });
  });

  describe('unlocking a job locked by wrong codes (review follow-up)', () => {
    async function lockedJob(over: { orderStatus?: string; attempts?: number } = {}) {
      const driver = await f.makeDriver('Test Driver Unlock');
      const g = await f.seedGroup({ orderStatus: over.orderStatus, groupStatus: 'shipped' });
      const id = await f.seedAssignment(g.groupId, driver.id, 'picked_up', {
        otp: '654321',
        attempts: over.attempts ?? DELIVERY_OTP_MAX_ATTEMPTS,
      });
      return { driver, g, id };
    }

    it('shows the job as locked in the admin list', async () => {
      const { g } = await lockedJob();
      const { items } = await assignments.list({
        orderId: g.orderId,
        status: 'picked_up',
        page: 1,
        pageSize: 10,
      } as never);
      expect(items[0].locked).toBe(true);
    });

    it('resets the tries, issues a new code and tells the customer', async () => {
      const { g, id } = await lockedJob();
      f.notifications.calls.length = 0;

      const dto = await assignments.unlock(f.t.adminUserId, id);

      expect(dto.locked).toBe(false);
      const row = await f.row(id);
      expect(row.otp_attempts).toBe(0);
      expect(row.status).toBe('picked_up');
      expect(row.delivery_otp).toMatch(/^\d{6}$/);
      expect(f.notifications.callsTo('sendDeliveryOtp')).toHaveLength(1);
      expect(f.notifications.callsTo('sendDeliveryOtp')[0].args.slice(0, 2)).toEqual([
        f.t.customerId,
        g.orderId,
      ]);
    });

    it('the driver can deliver with the new code afterwards', async () => {
      const { driver, g, id } = await lockedJob();
      await assignments.unlock(f.t.adminUserId, id);
      const otp = (await f.row(id)).delivery_otp as string;
      const key = `delivery/${g.groupId}/delivered-${id}.jpg`;
      f.storage.seed(key);
      const job = await f.service.complete(driver.userId, id, otp, key);
      expect(job.status).toBe('delivered');
    });

    it('refuses a job that is not locked', async () => {
      const { id } = await lockedJob({ attempts: 2 });
      await expect(assignments.unlock(f.t.adminUserId, id)).rejects.toThrow(
        'only a job locked by wrong codes can be unlocked',
      );
    });

    it('refuses under a refunded order', async () => {
      const { id } = await lockedJob({ orderStatus: 'refunded' });
      await expect(assignments.unlock(f.t.adminUserId, id)).rejects.toThrow(BadRequestException);
      expect((await f.row(id)).otp_attempts).toBe(DELIVERY_OTP_MAX_ATTEMPTS);
    });
  });
});
