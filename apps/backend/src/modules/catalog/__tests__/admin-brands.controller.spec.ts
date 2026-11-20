import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Role } from '@golden-abode/types';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminBrandsController } from '../admin-brands.controller';
import { AdminBrandsService } from '../admin-brands.service';

// Stands in for JWT: the caller's role comes from a header, so the real
// RolesGuard still decides who gets in.
class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = { sub: 'admin-1', role: req.headers['x-role'] ?? Role.ADMIN };
    return true;
  }
}

// Decision 0063 / S2: what the brands API accepts over HTTP, and who may call it.
describe('AdminBrandsController', () => {
  let app: INestApplication;
  const service = {
    list: jest.fn(async () => ({ items: [], total: 0, page: 1, limit: 25, totalPages: 0 })),
    get: jest.fn(async () => ({})),
    create: jest.fn(async () => ({})),
    update: jest.fn(async () => ({})),
    setActive: jest.fn(async () => ({})),
    addAlias: jest.fn(async () => ({})),
    removeAlias: jest.fn(async () => ({})),
  };
  const ID = '11111111-1111-4111-8111-111111111111';
  const ALIAS_ID = '22222222-2222-4222-8222-222222222222';

  const valid = {
    name: 'Zorvex',
    manufacturerName: 'Zorvex Electric Pvt Ltd',
    manufacturerAddress: '12 Industrial Area, Noida',
    consumerCareEmail: 'care@zorvex.test',
    consumerCarePhone: '+91 1800 200 300',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminBrandsController],
      providers: [{ provide: AdminBrandsService, useValue: service }],
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

  const post = (body: object, role: Role = Role.ADMIN) =>
    request(app.getHttpServer()).post('/admin/brands').set('x-role', role).send(body);

  it('creates a brand from a valid body, trimmed', async () => {
    const res = await post({ ...valid, name: '  Zorvex  ' });

    expect(res.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith({ ...valid, name: 'Zorvex' });
  });

  it.each([
    ['an invalid email', { ...valid, consumerCareEmail: 'not-an-email' }],
    ['a phone with letters', { ...valid, consumerCarePhone: '1800-CALL-NOW' }],
    ['a phone that is too short', { ...valid, consumerCarePhone: '12345' }],
    ['a missing manufacturer address', { ...valid, manufacturerAddress: undefined }],
    ['a blank manufacturer name', { ...valid, manufacturerName: '   ' }],
    ['a missing name', { ...valid, name: undefined }],
    ['an unknown field', { ...valid, isActive: false }],
  ])('refuses %s with 400', async (_label, body) => {
    expect((await post(body)).status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('passes list filters through, converting isActive and paging', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/brands?search=zor&isActive=false&page=2&limit=10')
      .set('x-role', Role.ADMIN);

    expect(res.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith({
      search: 'zor',
      isActive: false,
      page: 2,
      limit: 10,
    });
  });

  it('refuses a malformed brand id', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/brands/nope')
      .set('x-role', Role.ADMIN);
    expect(res.status).toBe(400);
  });

  describe('update, activation, aliases', () => {
    const http = () => request(app.getHttpServer());

    it('passes a partial, trimmed edit to the service', async () => {
      const res = await http()
        .patch(`/admin/brands/${ID}`)
        .send({ consumerCareEmail: ' help@zorvex.test ' });

      expect(res.status).toBe(200);
      expect(service.update).toHaveBeenCalledWith(ID, { consumerCareEmail: 'help@zorvex.test' });
    });

    it.each([
      ['an invalid email', { consumerCareEmail: 'nope' }],
      ['a blank name', { name: '  ' }],
      ['isActive (has its own endpoint)', { isActive: false }],
      ['a slug (never edited)', { slug: 'x' }],
    ])('refuses an edit with %s', async (_label, body) => {
      expect((await http().patch(`/admin/brands/${ID}`).send(body)).status).toBe(400);
      expect(service.update).not.toHaveBeenCalled();
    });

    it('sets the active flag', async () => {
      const res = await http().patch(`/admin/brands/${ID}/active`).send({ isActive: false });

      expect(res.status).toBe(200);
      expect(service.setActive).toHaveBeenCalledWith(ID, false);
    });

    it.each([[{}], [{ isActive: 'no' }]])('refuses an active flag body of %j', async (body) => {
      expect((await http().patch(`/admin/brands/${ID}/active`).send(body)).status).toBe(400);
      expect(service.setActive).not.toHaveBeenCalled();
    });

    it('adds an alias', async () => {
      const res = await http().post(`/admin/brands/${ID}/aliases`).send({ alias: ' H.I.L ' });

      expect(res.status).toBe(201);
      expect(service.addAlias).toHaveBeenCalledWith(ID, 'H.I.L');
    });

    it('refuses a blank alias', async () => {
      expect((await http().post(`/admin/brands/${ID}/aliases`).send({ alias: ' ' })).status).toBe(
        400,
      );
    });

    it('removes an alias by id', async () => {
      const res = await http().delete(`/admin/brands/${ID}/aliases/${ALIAS_ID}`);

      expect(res.status).toBe(200);
      expect(service.removeAlias).toHaveBeenCalledWith(ID, ALIAS_ID);
    });

    it('refuses a malformed alias id', async () => {
      expect((await http().delete(`/admin/brands/${ID}/aliases/nope`)).status).toBe(400);
    });
  });

  it('refuses anyone who is not an admin', async () => {
    for (const role of [Role.CUSTOMER, Role.VENDOR, Role.ARTISAN]) {
      expect((await post(valid, role)).status).toBe(403);
    }
    expect(service.create).not.toHaveBeenCalled();
  });
});
