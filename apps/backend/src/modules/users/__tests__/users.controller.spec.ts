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
