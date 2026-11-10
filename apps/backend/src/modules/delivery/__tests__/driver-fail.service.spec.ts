import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DriverFixture, setupDriverFixture } from './driver-fixture';

jest.setTimeout(60_000);

describe('DriverDeliveriesService.fail (decision 0060 rule 6)', () => {
  let f: DriverFixture;

  beforeAll(async () => {
    f = await setupDriverFixture();
  });
  afterAll(async () => {
    await f.close();
  });

  async function seedOnTheRoad(over: { orderStatus?: string; status?: string } = {}) {
    const driver = await f.makeDriver('Test Driver Fail');
    const g = await f.seedGroup({ orderStatus: over.orderStatus, groupStatus: 'shipped' });
    const id = await f.seedAssignment(g.groupId, driver.id, over.status ?? 'picked_up');
    const photoKey = `delivery/${g.groupId}/failed-${id}.jpg`;
    f.storage.seed(photoKey);
    return { driver, g, id, photoKey };
  }

  async function expectUntouched(id: string, groupId: string) {
    expect((await f.row(id)).status).toBe('picked_up');
    expect(await f.groupStatus(groupId)).toBe('shipped');
  }

  it('records the reason, note and photo and puts the group in delivery_failed', async () => {
    const { driver, g, id, photoKey } = await seedOnTheRoad();

    const job = await f.service.fail(
      driver.userId,
      id,
      'customer_unavailable',
      'Gate locked, phone off',
      photoKey,
    );

    expect(job).toMatchObject({
      id,
      status: 'failed',
      failureReason: 'customer_unavailable',
      failedAt: expect.any(String),
    });
    const r = await f.row(id);
    expect(r.status).toBe('failed');
    expect(r.failure_reason).toBe('customer_unavailable');
    expect(r.failure_note).toBe('Gate locked, phone off');
    expect(r.failure_photo_key).toBe(photoKey);
    expect(r.failed_at).not.toBeNull();
    expect(await f.groupStatus(g.groupId)).toBe('delivery_failed');
  });

  it('the note is optional', async () => {
    const { driver, id, photoKey } = await seedOnTheRoad();
    await f.service.fail(driver.userId, id, 'other', undefined, photoKey);
    expect((await f.row(id)).failure_note).toBeNull();
  });

  it('refuses a reason outside the allowed list', async () => {
    const { driver, g, id, photoKey } = await seedOnTheRoad();
    await expect(
      f.service.fail(driver.userId, id, 'felt_like_it' as never, undefined, photoKey),
    ).rejects.toThrow(BadRequestException);
    await expectUntouched(id, g.groupId);
  });

  it('refuses a missing, foreign or wrong-kind photo', async () => {
    const { driver, g, id } = await seedOnTheRoad();
    const wrongKind = `delivery/${g.groupId}/delivered-x.jpg`;
    f.storage.seed(wrongKind);
    for (const key of ['', wrongKind, `delivery/${g.groupId}/failed-never-uploaded.jpg`]) {
      await expect(f.service.fail(driver.userId, id, 'other', undefined, key)).rejects.toThrow(
        BadRequestException,
      );
    }
    await expectUntouched(id, g.groupId);
  });

  it('refuses a note over 500 characters', async () => {
    const { driver, g, id, photoKey } = await seedOnTheRoad();
    await expect(
      f.service.fail(driver.userId, id, 'other', 'x'.repeat(501), photoKey),
    ).rejects.toThrow(BadRequestException);
    await expectUntouched(id, g.groupId);
  });

  it('refuses a job that is not picked up', async () => {
    const { driver, id, photoKey } = await seedOnTheRoad({ status: 'assigned' });
    await expect(f.service.fail(driver.userId, id, 'other', undefined, photoKey)).rejects.toThrow(
      BadRequestException,
    );
    expect((await f.row(id)).status).toBe('assigned');
  });

  it.each(['refunded', 'refund_pending', 'cancelled'])(
    'refuses when the parent order is %s (Review Focus 2)',
    async (orderStatus) => {
      const { driver, g, id, photoKey } = await seedOnTheRoad({ orderStatus });
      await expect(f.service.fail(driver.userId, id, 'other', undefined, photoKey)).rejects.toThrow(
        BadRequestException,
      );
      await expectUntouched(id, g.groupId);
    },
  );

  it("404s on another driver's job", async () => {
    const { id, photoKey } = await seedOnTheRoad();
    const stranger = await f.makeDriver('Test Driver Stranger Three');
    await expect(f.service.fail(stranger.userId, id, 'other', undefined, photoKey)).rejects.toThrow(
      NotFoundException,
    );
  });
});
