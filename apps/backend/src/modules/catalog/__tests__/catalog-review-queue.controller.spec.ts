import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Role } from '@golden-abode/types';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CatalogReviewQueueController } from '../catalog-review-queue.controller';
import { VendorCatalogImportService } from '../vendor-catalog-import.service';

class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = { sub: 'admin-1', role: req.headers['x-role'] ?? Role.ADMIN };
    return true;
  }
}

const ROW = '11111111-1111-4111-8111-111111111111';

// Decision 0063 / S9: the prefill route.
describe('CatalogReviewQueueController prefill', () => {
  let app: INestApplication;
  const service = { prefillReviewRow: jest.fn(async () => ({ name: 'Zorvex 6A switch' })) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogReviewQueueController],
      providers: [{ provide: VendorCatalogImportService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(HeaderAuthGuard)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('answers the prefill for a row', async () => {
    const res = await request(app.getHttpServer()).get(
      `/admin/catalog-review-queue/${ROW}/prefill`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'Zorvex 6A switch' });
    expect(service.prefillReviewRow).toHaveBeenCalledWith(ROW);
  });

  it('refuses a malformed id and non-admins', async () => {
    expect(
      (await request(app.getHttpServer()).get('/admin/catalog-review-queue/nope/prefill')).status,
    ).toBe(400);
    expect(
      (
        await request(app.getHttpServer())
          .get(`/admin/catalog-review-queue/${ROW}/prefill`)
          .set('x-role', Role.VENDOR)
      ).status,
    ).toBe(403);
    expect(service.prefillReviewRow).not.toHaveBeenCalled();
  });
});
