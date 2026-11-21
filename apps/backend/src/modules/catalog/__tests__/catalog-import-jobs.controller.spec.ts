import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Role } from '@golden-abode/types';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CatalogImportJobsController } from '../catalog-import-jobs.controller';
import { CatalogImportJobsService } from '../catalog-import-jobs.service';

class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = { sub: 'admin-1', role: req.headers['x-role'] ?? Role.ADMIN };
    return true;
  }
}

const CATEGORY = '11111111-1111-4111-8111-111111111111';
const JOB = '22222222-2222-4222-8222-222222222222';
const XLSX_NAME = 'products.xlsx';

// Decision 0063 / S7 Task 3: the import endpoints over HTTP.
describe('CatalogImportJobsController', () => {
  let app: INestApplication;
  const jobs = {
    enqueue: jest.fn(async () => ({ jobId: JOB })),
    list: jest.fn(async () => ({ items: [], total: 0, page: 1, limit: 25, totalPages: 0 })),
    get: jest.fn(async () => ({ id: JOB, status: 'running', processedRows: 20 })),
    getErrorDownloadUrl: jest.fn(async () => ({ url: 'https://signed.test/errors.xlsx' })),
    undo: jest.fn(async () => ({ deleted: 2, kept: 1 })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogImportJobsController],
      providers: [{ provide: CatalogImportJobsService, useValue: jobs }],
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

  const server = () => request(app.getHttpServer());

  it('accepts an .xlsx upload with 202 and the job id', async () => {
    const body = Buffer.from('PK fake workbook');
    const res = await server()
      .post(`/admin/catalog-import/${CATEGORY}`)
      .attach('file', body, XLSX_NAME);

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ jobId: JOB });
    expect(jobs.enqueue).toHaveBeenCalledWith('admin-1', CATEGORY, body);
  });

  it('refuses a file that is not .xlsx with 400', async () => {
    const res = await server()
      .post(`/admin/catalog-import/${CATEGORY}`)
      .attach('file', Buffer.from('a,b'), 'products.csv');

    expect(res.status).toBe(400);
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it('refuses a missing file with 400', async () => {
    expect((await server().post(`/admin/catalog-import/${CATEGORY}`)).status).toBe(400);
  });

  it('refuses a file over 20 MB with 413', async () => {
    const res = await server()
      .post(`/admin/catalog-import/${CATEGORY}`)
      .attach('file', Buffer.alloc(20 * 1024 * 1024 + 1), XLSX_NAME);

    expect(res.status).toBe(413);
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it('lists imports with paging', async () => {
    const res = await server().get('/admin/catalog-import/jobs?page=2&limit=10');

    expect(res.status).toBe(200);
    expect(jobs.list).toHaveBeenCalledWith({ page: 2, limit: 10 });
  });

  it('answers one import with its progress', async () => {
    const res = await server().get(`/admin/catalog-import/jobs/${JOB}`);

    expect(res.body).toEqual({ id: JOB, status: 'running', processedRows: 20 });
  });

  it('gives the rejected-rows download link', async () => {
    const res = await server().get(`/admin/catalog-import/jobs/${JOB}/errors`);

    expect(res.body).toEqual({ url: 'https://signed.test/errors.xlsx' });
  });

  it('undoes an import as the calling admin', async () => {
    const res = await server().post(`/admin/catalog-import/jobs/${JOB}/undo`);

    expect(res.status).toBe(201);
    expect(jobs.undo).toHaveBeenCalledWith(JOB, 'admin-1');
  });

  it('refuses malformed ids and non-admins', async () => {
    expect((await server().get('/admin/catalog-import/jobs/nope')).status).toBe(400);
    expect(
      (
        await server()
          .post('/admin/catalog-import/nope')
          .attach('file', Buffer.from('x'), XLSX_NAME)
      ).status,
    ).toBe(400);
    for (const call of [
      () => server().get('/admin/catalog-import/jobs'),
      () => server().get(`/admin/catalog-import/jobs/${JOB}`),
      () => server().get(`/admin/catalog-import/jobs/${JOB}/errors`),
      () => server().post(`/admin/catalog-import/jobs/${JOB}/undo`),
      () =>
        server()
          .post(`/admin/catalog-import/${CATEGORY}`)
          .set('x-role', Role.VENDOR)
          .attach('file', Buffer.from('x'), XLSX_NAME),
    ]) {
      expect((await call().set('x-role', Role.VENDOR)).status).toBe(403);
    }
    expect(jobs.enqueue).not.toHaveBeenCalled();
    expect(jobs.undo).not.toHaveBeenCalled();
  });
});
