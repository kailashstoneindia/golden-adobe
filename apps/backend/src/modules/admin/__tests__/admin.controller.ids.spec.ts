import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AdminController } from '../admin.controller';
import { AdminService } from '../admin.service';

// Task 7 review: a malformed user id is a clean 400, not a database error.
describe('AdminController user ids', () => {
  let app: INestApplication;
  const service = {
    getUserById: jest.fn(async (id: string) => ({ id })),
    approveUser: jest.fn(async (id: string) => ({ id })),
    rejectUser: jest.fn(async (id: string) => ({ id })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['get', '/admin/users/not-a-uuid'],
    ['patch', '/admin/users/not-a-uuid/approve'],
    ['patch', '/admin/users/not-a-uuid/reject'],
  ] as const)('%s %s is refused with 400 before reaching the service', async (method, url) => {
    const res = await request(app.getHttpServer())[method](url).send({});

    expect(res.status).toBe(400);
    expect(service.getUserById).not.toHaveBeenCalled();
    expect(service.approveUser).not.toHaveBeenCalled();
    expect(service.rejectUser).not.toHaveBeenCalled();
  });

  it('passes a real id through', async () => {
    const id = '11111111-1111-4111-8111-111111111111';

    expect((await request(app.getHttpServer()).get(`/admin/users/${id}`)).status).toBe(200);
    expect(service.getUserById).toHaveBeenCalledWith(id);
  });
});
