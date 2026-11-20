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
  const catalog = {
    updateProduct: jest.fn(async () => ({ id: ID })),
    retireProduct: jest.fn(async () => ({ id: ID })),
    restoreProduct: jest.fn(async () => ({ id: ID })),
    deleteProduct: jest.fn(async () => undefined),
  };
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

  describe('PATCH product, all fields', () => {
    const patch = (body: object) =>
      request(app.getHttpServer()).patch(`/admin/catalog/products/${ID}`).send(body);
    const BRAND = '22222222-2222-4222-8222-222222222222';

    it('passes the new fields through, trimmed, with nulls that clear', async () => {
      const res = await patch({
        brandId: BRAND,
        mfrPartNumber: ' MCB-10 ',
        gtin: null,
        hsnCode: '8536',
        gstRate: 18,
        countryOfOrigin: ' India ',
        importerDetails: null,
      });

      expect(res.status).toBe(200);
      expect(catalog.updateProduct).toHaveBeenCalledWith(ID, 'admin-1', {
        brandId: BRAND,
        mfrPartNumber: 'MCB-10',
        gtin: null,
        hsnCode: '8536',
        gstRate: 18,
        countryOfOrigin: 'India',
        importerDetails: null,
      });
    });

    it.each([
      ['a category (never editable)', { categoryId: BRAND }],
      ['a malformed brand id', { brandId: 'nope' }],
      ['a null brand', { brandId: null }],
      ['a GST rate over 100', { gstRate: 150 }],
      ['a negative GST rate', { gstRate: -1 }],
      ['a blank country of origin', { countryOfOrigin: ' ' }],
      ['a null country of origin', { countryOfOrigin: null }],
      ['a product code', { productCode: 'GA-0000001' }],
      ['a slug', { slug: 'x' }],
    ])('refuses %s with 400', async (_label, body) => {
      expect((await patch(body)).status).toBe(400);
      expect(catalog.updateProduct).not.toHaveBeenCalled();
    });
  });

  describe('retire, restore, delete', () => {
    const server = () => request(app.getHttpServer());

    it('retires and restores as the calling admin', async () => {
      expect((await server().patch(`/admin/catalog/products/${ID}/retire`)).status).toBe(200);
      expect(catalog.retireProduct).toHaveBeenCalledWith(ID, 'admin-1');
      expect((await server().patch(`/admin/catalog/products/${ID}/restore`)).status).toBe(200);
      expect(catalog.restoreProduct).toHaveBeenCalledWith(ID, 'admin-1');
    });

    it('deletes, answering 204', async () => {
      expect((await server().delete(`/admin/catalog/products/${ID}`)).status).toBe(204);
      expect(catalog.deleteProduct).toHaveBeenCalledWith(ID, 'admin-1');
    });

    it('refuses malformed ids and non-admins', async () => {
      expect((await server().delete('/admin/catalog/products/nope')).status).toBe(400);
      expect(
        (await server().patch(`/admin/catalog/products/${ID}/retire`).set('x-role', Role.VENDOR))
          .status,
      ).toBe(403);
      expect(catalog.deleteProduct).not.toHaveBeenCalled();
      expect(catalog.retireProduct).not.toHaveBeenCalled();
    });
  });

  it('GET readiness refuses a malformed id and non-admins', async () => {
    expect((await http().get('/admin/catalog/products/nope/readiness')).status).toBe(400);
    expect((await http(Role.VENDOR).get(`/admin/catalog/products/${ID}/readiness`)).status).toBe(
      403,
    );
    expect(readiness.getReadiness).not.toHaveBeenCalled();
  });
});
