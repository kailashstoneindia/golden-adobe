import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DriverFixture, setupDriverFixture } from './driver-fixture';

jest.setTimeout(60_000);

describe('DriverDeliveriesService.complete (decision 0060 rules 4 and 5)', () => {
  let f: DriverFixture;

  beforeAll(async () => {
    f = await setupDriverFixture();
  });
  afterAll(async () => {
    await f.close();
  });

  async function seedOnTheRoad(over: { orderStatus?: string; attempts?: number } = {}) {
    const driver = await f.makeDriver('Test Driver Complete');
    const g = await f.seedGroup({ orderStatus: over.orderStatus, groupStatus: 'shipped' });
    const id = await f.seedAssignment(g.groupId, driver.id, 'picked_up', {
      otp: '123456',
      attempts: over.attempts,
    });
    const photoKey = `delivery/${g.groupId}/delivered-${id}.jpg`;
    f.storage.seed(photoKey);
    return { driver, g, id, photoKey };
  }

  it('the right code with a valid photo delivers the job and the group', async () => {
    const { driver, g, id, photoKey } = await seedOnTheRoad();
    f.notifications.calls.length = 0;

    const job = await f.service.complete(driver.userId, id, '123456', photoKey);

    expect(job).toMatchObject({ id, status: 'delivered', deliveredAt: expect.any(String) });
    const r = await f.row(id);
    expect(r.status).toBe('delivered');
    expect(r.delivered_at).not.toBeNull();
    expect(r.delivery_photo_key).toBe(photoKey);
    expect(await f.groupStatus(g.groupId)).toBe('delivered');
    expect(f.notifications.callsTo('sendOrderStatusChanged')[0].args).toEqual([
      f.t.customerId,
      g.orderId,
      'delivered',
    ]);
  });

  it('a wrong code is a 400 and is counted, even though the request failed', async () => {
    const { driver, id, photoKey } = await seedOnTheRoad();
    await expect(f.service.complete(driver.userId, id, '000000', photoKey)).rejects.toThrow(
      BadRequestException,
    );
    await expect(f.service.complete(driver.userId, id, '111111', photoKey)).rejects.toThrow(
      BadRequestException,
    );
    const r = await f.row(id);
    expect(r.otp_attempts).toBe(2);
    expect(r.status).toBe('picked_up');
  });

  it('the 5th wrong code is a 403, and afterwards even the right code is refused (Review Focus 3)', async () => {
    const { driver, g, id, photoKey } = await seedOnTheRoad();
    for (let i = 0; i < 4; i += 1) {
      await expect(f.service.complete(driver.userId, id, '000000', photoKey)).rejects.toThrow(
        BadRequestException,
      );
    }
    await expect(f.service.complete(driver.userId, id, '000000', photoKey)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(f.service.complete(driver.userId, id, '123456', photoKey)).rejects.toThrow(
      ForbiddenException,
    );
    const r = await f.row(id);
    expect(r.status).toBe('picked_up');
    expect(r.otp_attempts).toBe(5);
    expect(await f.groupStatus(g.groupId)).toBe('shipped');
  });

  it('a job that already has 5 failed tries stays locked on the first request', async () => {
    const { driver, id, photoKey } = await seedOnTheRoad({ attempts: 5 });
    await expect(f.service.complete(driver.userId, id, '123456', photoKey)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('a missing, foreign or wrong-kind photo is a 400 and the code is not counted', async () => {
    const { driver, g, id } = await seedOnTheRoad();
    const foreign = `delivery/00000000-0000-4000-8000-000000000000/delivered-x.jpg`;
    const wrongKind = `delivery/${g.groupId}/failed-x.jpg`;
    const missing = `delivery/${g.groupId}/delivered-never-uploaded.jpg`;
    f.storage.seed(foreign);
    f.storage.seed(wrongKind);
    for (const key of [foreign, wrongKind, missing]) {
      await expect(f.service.complete(driver.userId, id, '123456', key)).rejects.toThrow(
        BadRequestException,
      );
    }
    const r = await f.row(id);
    expect(r.otp_attempts).toBe(0);
    expect(r.status).toBe('picked_up');
  });

  it('is refused for a job that is only assigned, counting nothing', async () => {
    const driver = await f.makeDriver('Test Driver Not Picked');
    const g = await f.seedGroup();
    const id = await f.seedAssignment(g.groupId, driver.id, 'assigned');
    const key = `delivery/${g.groupId}/delivered-a.jpg`;
    f.storage.seed(key);
    await expect(f.service.complete(driver.userId, id, '123456', key)).rejects.toThrow(
      BadRequestException,
    );
    expect((await f.row(id)).otp_attempts).toBe(0);
  });

  it.each(['refunded', 'refund_pending', 'cancelled'])(
    'is refused, counting nothing, when the parent order is %s (Review Focus 2)',
    async (orderStatus) => {
      const { driver, g, id, photoKey } = await seedOnTheRoad({ orderStatus });
      await expect(f.service.complete(driver.userId, id, '123456', photoKey)).rejects.toThrow(
        BadRequestException,
      );
      const r = await f.row(id);
      expect(r.status).toBe('picked_up');
      expect(r.otp_attempts).toBe(0);
      expect(await f.groupStatus(g.groupId)).toBe('shipped');
    },
  );

  it("404s on another driver's job", async () => {
    const { id, photoKey } = await seedOnTheRoad();
    const stranger = await f.makeDriver('Test Driver Stranger Two');
    await expect(f.service.complete(stranger.userId, id, '123456', photoKey)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('a finished job cannot be completed again', async () => {
    const { driver, id, photoKey } = await seedOnTheRoad();
    await f.service.complete(driver.userId, id, '123456', photoKey);
    await expect(f.service.complete(driver.userId, id, '123456', photoKey)).rejects.toThrow(
      BadRequestException,
    );
  });
});
