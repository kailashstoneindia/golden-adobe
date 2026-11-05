import request from 'supertest';

import { createUsersTestApp, UsersTestApp } from './users-test-app';
import { User } from '../models/user.model';

jest.setTimeout(60_000);

describe('UsersController device token (real HTTP, Postgres)', () => {
  let t: UsersTestApp;

  const asCustomer = (req: request.Test) => req.set('Authorization', `Bearer ${t.customerToken}`);

  beforeAll(async () => {
    t = await createUsersTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('saves the device token for the authenticated user', async () => {
    const res = await asCustomer(
      request(t.app.getHttpServer())
        .patch('/api/users/me/device-token')
        .send({ deviceToken: 'ExponentPushToken[abc123]' }),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);

    const user = await User.findByPk(t.customerUserId);
    expect(user!.deviceToken).toBe('ExponentPushToken[abc123]');
  });

  // Decision 0058 whole-branch review: approval has one writer (AdminService, which keeps
  // users.is_approved, artisans.is_verified and vendors.status in step and logs the admin).
  // This old route set the bare flag and is gone: 404, where it used to answer 403 here.
  it('no longer has a bare approve route', async () => {
    const res = await asCustomer(
      request(t.app.getHttpServer()).patch(
        '/api/users/11111111-1111-4111-8111-111111111111/approve',
      ),
    );

    expect(res.status).toBe(404);
  });

  it('answers 400 for an empty device token', async () => {
    const res = await asCustomer(
      request(t.app.getHttpServer()).patch('/api/users/me/device-token').send({ deviceToken: '' }),
    );
    expect(res.status).toBe(400);
  });

  it('answers 401 without a token', async () => {
    const res = await request(t.app.getHttpServer())
      .patch('/api/users/me/device-token')
      .send({ deviceToken: 'ExponentPushToken[abc123]' });
    expect(res.status).toBe(401);
  });
});
