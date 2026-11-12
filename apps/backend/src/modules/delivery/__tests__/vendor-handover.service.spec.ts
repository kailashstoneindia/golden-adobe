import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { VendorHandoverService } from '../vendor-handover.service';
import { DriverFixture, setupDriverFixture } from './driver-fixture';

jest.setTimeout(60_000);

describe('VendorHandoverService (decision 0060 rule 9)', () => {
  let f: DriverFixture;
  let service: VendorHandoverService;

  beforeAll(async () => {
    f = await setupDriverFixture();
    service = f.d.moduleRef.get(VendorHandoverService);
  });
  afterAll(async () => {
    await f.close();
  });

  const vendorOf = async (groupId: string) =>
    (
      await f.t.query<{ vendor_id: string }>(
        `SELECT vendor_id FROM order_vendor_group WHERE id = :id`,
        { id: groupId },
      )
    )[0].vendor_id;

  async function seedAssigned(over: { assign?: boolean } = {}) {
    const g = await f.seedGroup();
    const vendorId = await vendorOf(g.groupId);
    let assignmentId: string | null = null;
    if (over.assign !== false) {
      const driver = await f.makeDriver('Test Driver Handover');
      assignmentId = await f.seedAssignment(g.groupId, driver.id, 'assigned');
    }
    return { g, vendorId, assignmentId };
  }

  const strangerVendor = () => randomUUID();

  describe('markHandedOver', () => {
    it('stamps the open assignment and leaves the group status alone', async () => {
      const { g, vendorId, assignmentId } = await seedAssigned();

      const res = await service.markHandedOver(vendorId, g.groupId);

      expect(res.vendorHandedOverAt).toEqual(expect.any(String));
      const r = await f.row(assignmentId!);
      expect(r.vendor_handed_over_at).not.toBeNull();
      expect(r.vendor_handover_photo_key).toBeNull();
      expect(r.status).toBe('assigned');
      expect(await f.groupStatus(g.groupId)).toBe('ready_for_pickup');
    });

    it('is idempotent: a second call keeps the first timestamp', async () => {
      const { g, vendorId, assignmentId } = await seedAssigned();

      const first = await service.markHandedOver(vendorId, g.groupId);
      const second = await service.markHandedOver(vendorId, g.groupId);

      expect(second.vendorHandedOverAt).toBe(first.vendorHandedOverAt);
      const r = await f.row(assignmentId!);
      expect(new Date(r.vendor_handed_over_at as Date).toISOString()).toBe(
        first.vendorHandedOverAt,
      );
    });

    it('records a handover photo that was really uploaded for this group', async () => {
      const { g, vendorId, assignmentId } = await seedAssigned();
      const key = `delivery/${g.groupId}/handover-${randomUUID()}.jpg`;
      f.storage.seed(key);

      await service.markHandedOver(vendorId, g.groupId, key);

      expect((await f.row(assignmentId!)).vendor_handover_photo_key).toBe(key);
    });

    it.each([
      [
        'a key that was never uploaded',
        (gid: string) => `delivery/${gid}/handover-nope.jpg`,
        false,
      ],
      ["another group's key", () => `delivery/${randomUUID()}/handover-x.jpg`, true],
      ['a delivered-kind key', (gid: string) => `delivery/${gid}/delivered-x.jpg`, true],
    ])('400s on %s and changes nothing', async (_label, makeKey, uploaded) => {
      const { g, vendorId, assignmentId } = await seedAssigned();
      const key = makeKey(g.groupId);
      if (uploaded) f.storage.seed(key);

      await expect(service.markHandedOver(vendorId, g.groupId, key)).rejects.toThrow(
        BadRequestException,
      );
      expect((await f.row(assignmentId!)).vendor_handed_over_at).toBeNull();
    });

    it('400s when no driver is assigned yet', async () => {
      const { g, vendorId } = await seedAssigned({ assign: false });
      await expect(service.markHandedOver(vendorId, g.groupId)).rejects.toThrow(
        /no driver assigned yet/,
      );
    });

    it('ignores a cancelled assignment: only an open one counts', async () => {
      const { g, vendorId, assignmentId } = await seedAssigned();
      await f.t.query(`UPDATE delivery_assignments SET status = 'cancelled' WHERE id = :id`, {
        id: assignmentId,
      });
      await expect(service.markHandedOver(vendorId, g.groupId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("404s on another vendor's group (Review Focus 5) and stamps nothing", async () => {
      const { g, assignmentId } = await seedAssigned();
      await expect(service.markHandedOver(strangerVendor(), g.groupId)).rejects.toThrow(
        NotFoundException,
      );
      expect((await f.row(assignmentId!)).vendor_handed_over_at).toBeNull();
    });

    it('404s on an unknown group', async () => {
      const { vendorId } = await seedAssigned();
      await expect(service.markHandedOver(vendorId, randomUUID())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createPhotoUrl', () => {
    it('mints a handover key under the group for the owning vendor', async () => {
      const { g, vendorId } = await seedAssigned();
      const spy = jest.spyOn(f.storage, 'presignPost');
      const post = await service.createPhotoUrl(vendorId, g.groupId, 'image/jpeg');
      expect(post.url).toEqual(expect.any(String));
      const [{ key }] = spy.mock.calls[0] as unknown as [{ key: string }];
      expect(key).toMatch(new RegExp(`^delivery/${g.groupId}/handover-.+\\.jpg$`));
      spy.mockRestore();
    });

    it('400s on a content type that is not jpeg or png', async () => {
      const { g, vendorId } = await seedAssigned();
      await expect(service.createPhotoUrl(vendorId, g.groupId, 'application/pdf')).rejects.toThrow(
        BadRequestException,
      );
    });

    it("404s on another vendor's group (Review Focus 5)", async () => {
      const { g } = await seedAssigned();
      await expect(
        service.createPhotoUrl(strangerVendor(), g.groupId, 'image/png'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
