import request from 'supertest';
import { DriverFixture, setupDriverFixture } from './driver-fixture';

jest.setTimeout(60_000);

// Decision 0060 rule 5, through the real customer and admin order routes.
describe('delivery code on the order routes', () => {
  let f: DriverFixture;

  beforeAll(async () => {
    f = await setupDriverFixture();
  });
  afterAll(async () => {
    await f.close();
  });

  const http = () => request(f.t.app.getHttpServer());
  const asCustomer = (path: string) =>
    http().get(path).set('Authorization', `Bearer ${f.t.customerToken}`);
  const asAdmin = (path: string) =>
    http().get(path).set('Authorization', `Bearer ${f.t.adminToken}`);

  async function seed(groupStatus: string, assignmentStatus: string | null, otp = '482913') {
    const g = await f.seedGroup({ groupStatus });
    if (assignmentStatus) {
      const driver = await f.makeDriver('Test Driver Otp');
      await f.seedAssignment(g.groupId, driver.id, assignmentStatus, { otp });
    }
    return g;
  }

  const groupOf = (body: { data: { vendorGroups: { id: string }[] } }, groupId: string) =>
    body.data.vendorGroups.find((x) => x.id === groupId) as Record<string, unknown>;

  it('shows the customer the code while the group is shipped', async () => {
    const g = await seed('shipped', 'picked_up');

    const one = await asCustomer(`/api/orders/${g.orderId}`);
    expect(one.status).toBe(200);
    expect(groupOf(one.body, g.groupId).deliveryOtp).toBe('482913');

    const list = await asCustomer('/api/orders');
    const order = list.body.data.find((o: { id: string }) => o.id === g.orderId);
    expect(order.vendorGroups[0].deliveryOtp).toBe('482913');
  });

  it.each([
    ['assigned but not picked up', 'ready_for_pickup', 'assigned'],
    ['delivered', 'delivered', 'delivered'],
    ['not yet assigned', 'ready_for_pickup', null],
  ])('shows null when the group is %s', async (_label, groupStatus, assignmentStatus) => {
    const g = await seed(groupStatus, assignmentStatus);
    const res = await asCustomer(`/api/orders/${g.orderId}`);
    expect(groupOf(res.body, g.groupId).deliveryOtp).toBeNull();
  });

  it('ignores a failed earlier attempt: only the open assignment counts', async () => {
    const g = await seed('shipped', 'failed', '999999');
    const res = await asCustomer(`/api/orders/${g.orderId}`);
    expect(groupOf(res.body, g.groupId).deliveryOtp).toBeNull();
  });

  it("shows the open attempt's code, not an earlier failed one", async () => {
    const g = await seed('shipped', 'failed', '999999');
    const driver = await f.makeDriver('Test Driver Retry Otp');
    await f.seedAssignment(g.groupId, driver.id, 'picked_up', { otp: '135790' });
    const res = await asCustomer(`/api/orders/${g.orderId}`);
    expect(groupOf(res.body, g.groupId).deliveryOtp).toBe('135790');
  });

  it('never puts the code in the admin order view', async () => {
    const g = await seed('shipped', 'picked_up');
    const res = await asAdmin(`/api/admin/orders/${g.orderId}`);
    expect(res.status).toBe(200);
    expect(groupOf(res.body, g.groupId)).not.toHaveProperty('deliveryOtp');
    expect(JSON.stringify(res.body)).not.toContain('482913');
  });
});
