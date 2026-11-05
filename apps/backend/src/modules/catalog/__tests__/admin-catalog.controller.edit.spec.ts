import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Role } from '@golden-abode/types';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminCatalogController } from '../admin-catalog.controller';
import { AdminCatalogService } from '../admin-catalog.service';

// Stands in for JWT: the caller's role comes from a header, so the real
// RolesGuard still decides who gets in.
class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = { sub: 'admin-1', role: req.headers['x-role'] ?? Role.ADMIN };
    return true;
  }
}

const ID = '11111111-1111-4111-8111-111111111111';

// Decision 0058 Task 13: what the product PATCH accepts, and who may call it.
describe('AdminCatalogController product edit', () => {
  let app: INestApplication;
  const service = { updateProduct: jest.fn(async () => ({ id: ID })) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminCatalogController],
      providers: [{ provide: AdminCatalogService, useValue: service }],
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

  const patch = (body: object, role: Role = Role.ADMIN, id = ID) =>
    request(app.getHttpServer())
      .patch(`/admin/catalog/products/${id}`)
      .set('x-role', role)
      .send(body);

  it('passes a trimmed name and the calling admin to the service', async () => {
    const res = await patch({ name: '  Black Galaxy Slab ' });

    expect(res.status).toBe(200);
    expect(service.updateProduct).toHaveBeenCalledWith(ID, 'admin-1', {
      name: 'Black Galaxy Slab',
    });
  });

  it.each([
    ['a null name (it would erase it)', { name: null }],
    ['a blank name', { name: '   ' }],
    ['a name longer than the column (255)', { name: 'x'.repeat(256) }],
    ['a null attribute set', { attributeValues: null }],
    ['an unknown field (categoryId)', { categoryId: ID }],
    ['an unknown field (status)', { status: 'live' }],
  ])('refuses %s with 400', async (_label, body) => {
    expect((await patch(body)).status).toBe(400);
    expect(service.updateProduct).not.toHaveBeenCalled();
  });

  it('refuses a malformed product id', async () => {
    expect((await patch({ name: 'X' }, Role.ADMIN, 'nope')).status).toBe(400);
  });

  it('refuses anyone who is not an admin', async () => {
    for (const role of [Role.CUSTOMER, Role.VENDOR, Role.ARTISAN]) {
      expect((await patch({ name: 'X' }, role)).status).toBe(403);
    }
    expect(service.updateProduct).not.toHaveBeenCalled();
  });
});
