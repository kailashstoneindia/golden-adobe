import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Role } from '@golden-abode/types';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminController } from '../admin.controller';
import { AdminService } from '../admin.service';

// Stands in for JWT: reads who is calling from a header, so the real
// RolesGuard still decides who gets in.
class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = { sub: 'admin-1', role: req.headers['x-role'] ?? Role.ADMIN };
    return true;
  }
}

const ID = '11111111-1111-4111-8111-111111111111';

// Decision 0058 Task 9: what the edit routes accept, and who may call them.
describe('AdminController user edit routes', () => {
  let app: INestApplication;
  const service = {
    updateUser: jest.fn(async () => ({ id: ID })),
    setUserActive: jest.fn(async () => ({ id: ID })),
    revokeUserSessions: jest.fn(async () => ({ id: ID })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(HeaderAuthGuard)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const patch = (url: string, body: object, role: Role = Role.ADMIN) =>
    request(app.getHttpServer()).patch(url).set('x-role', role).send(body);

  describe('PATCH /admin/users/:id', () => {
    it('passes name, email and phone to the service, with the calling admin', async () => {
      const res = await patch(`/admin/users/${ID}`, {
        name: '  Asha Rao ',
        email: ' Asha@Example.COM ',
        phone: '+919876543210',
      });

      expect(res.status).toBe(200);
      expect(service.updateUser).toHaveBeenCalledWith(ID, 'admin-1', {
        name: 'Asha Rao',
        email: 'asha@example.com',
        phone: '+919876543210',
      });
    });

    it.each([
      ['role', { role: 'ADMIN' }],
      ['isApproved', { isApproved: true }],
      ['isActive', { isActive: false }],
      ['passwordHash', { passwordHash: 'x' }],
      ['id', { id: ID }],
    ])('rejects the unknown field %s', async (_name, body) => {
      const res = await patch(`/admin/users/${ID}`, body);

      expect(res.status).toBe(400);
      expect(service.updateUser).not.toHaveBeenCalled();
    });

    it.each([
      ['a blank name', { name: '   ' }],
      ['an invalid email', { email: 'not-an-email' }],
      ['a non-Indian phone', { phone: '+14155550123' }],
      ['a phone with no country code', { phone: '9876543210' }],
    ])('rejects %s', async (_name, body) => {
      expect((await patch(`/admin/users/${ID}`, body)).status).toBe(400);
      expect(service.updateUser).not.toHaveBeenCalled();
    });

    it('refuses anyone who is not an admin', async () => {
      for (const role of [Role.CUSTOMER, Role.VENDOR, Role.ARTISAN]) {
        expect((await patch(`/admin/users/${ID}`, { name: 'X' }, role)).status).toBe(403);
      }
      expect(service.updateUser).not.toHaveBeenCalled();
    });

    it('refuses a malformed id', async () => {
      expect((await patch('/admin/users/nope', { name: 'X' })).status).toBe(400);
    });
  });

  describe('PATCH /admin/users/:id/active', () => {
    it('passes the flag through', async () => {
      const res = await patch(`/admin/users/${ID}/active`, { isActive: false });

      expect(res.status).toBe(200);
      expect(service.setUserActive).toHaveBeenCalledWith(ID, 'admin-1', false);
    });

    it('needs a real boolean', async () => {
      expect((await patch(`/admin/users/${ID}/active`, { isActive: 'no' })).status).toBe(400);
      expect((await patch(`/admin/users/${ID}/active`, {})).status).toBe(400);
    });

    it('refuses anyone who is not an admin', async () => {
      expect(
        (await patch(`/admin/users/${ID}/active`, { isActive: false }, Role.VENDOR)).status,
      ).toBe(403);
      expect(service.setUserActive).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/users/:id/revoke-sessions', () => {
    it('signs the user out, as the calling admin', async () => {
      const res = await request(app.getHttpServer()).post(`/admin/users/${ID}/revoke-sessions`);

      expect(res.status).toBe(200);
      expect(service.revokeUserSessions).toHaveBeenCalledWith(ID, 'admin-1');
    });

    it('refuses anyone who is not an admin', async () => {
      const res = await request(app.getHttpServer())
        .post(`/admin/users/${ID}/revoke-sessions`)
        .set('x-role', Role.CUSTOMER);

      expect(res.status).toBe(403);
      expect(service.revokeUserSessions).not.toHaveBeenCalled();
    });
  });
});
