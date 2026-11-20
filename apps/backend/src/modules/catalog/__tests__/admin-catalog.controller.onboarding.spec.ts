import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Role } from '@golden-abode/types';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminCatalogController } from '../admin-catalog.controller';
import { AdminCatalogService } from '../admin-catalog.service';
import { ProductReadinessService } from '../product-readiness.service';

class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = { sub: 'admin-1', role: req.headers['x-role'] ?? Role.ADMIN };
    return true;
  }
}

const ID = '11111111-1111-4111-8111-111111111111';

// Decision 0063 / S4: the product onboarding routes over HTTP.
describe('AdminCatalogController onboarding routes', () => {
  let app: INestApplication;
  const catalog = {};
  const readiness = { getReadiness: jest.fn(async () => ({ ready: true, checks: [] })) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminCatalogController],
      providers: [
        { provide: AdminCatalogService, useValue: catalog },
        { provide: ProductReadinessService, useValue: readiness },
      ],
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

  const http = (role: Role = Role.ADMIN) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('x-role', role),
  });

  it('GET readiness answers with the product checks', async () => {
    const res = await http().get(`/admin/catalog/products/${ID}/readiness`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ready: true, checks: [] });
    expect(readiness.getReadiness).toHaveBeenCalledWith(ID);
  });

  it('GET readiness refuses a malformed id and non-admins', async () => {
    expect((await http().get('/admin/catalog/products/nope/readiness')).status).toBe(400);
    expect((await http(Role.VENDOR).get(`/admin/catalog/products/${ID}/readiness`)).status).toBe(
      403,
    );
    expect(readiness.getReadiness).not.toHaveBeenCalled();
  });
});
