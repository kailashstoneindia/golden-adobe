import request from 'supertest';

import { createVendorsTestApp, VendorsTestApp } from './vendors-test-app';
import { Vendor } from '../models/vendor.model';
import { User } from '../../users/models/user.model';

jest.setTimeout(60_000);

describe('AdminVendorsController approve/reject (real HTTP, Postgres)', () => {
  let t: VendorsTestApp;

  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${t.adminToken}`);
  const asVendor = (req: request.Test) => req.set('Authorization', `Bearer ${t.vendorToken}`);

  beforeAll(async () => {
    t = await createVendorsTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('defaults a new vendor to PENDING status', async () => {
    const vendor = await Vendor.findOne({ where: { userId: t.vendorUserId } });
    expect(vendor!.status).toBe('PENDING');
  });

  it('approves a vendor: sets status APPROVED and User.isApproved true', async () => {
    const { userId, vendorId } = await t.newVendor();

    const res = await asAdmin(
      request(t.app.getHttpServer()).patch(`/api/admin/vendors/${vendorId}/approve`),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
    expect(res.body.data.rejectionReason).toBeNull();

    const user = await User.findByPk(userId);
    expect(user!.isApproved).toBe(true);
  });

  it('rejects a vendor: requires a reason, sets status REJECTED, persists the reason, and sets User.isApproved false', async () => {
    const { userId, vendorId } = await t.newVendor();

    const missingReason = await asAdmin(
      request(t.app.getHttpServer()).patch(`/api/admin/vendors/${vendorId}/reject`).send({}),
    );
    expect(missingReason.status).toBe(400);

    const res = await asAdmin(
      request(t.app.getHttpServer())
        .patch(`/api/admin/vendors/${vendorId}/reject`)
        .send({ reason: 'Invalid GSTIN on file' }),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');
    expect(res.body.data.rejectionReason).toBe('Invalid GSTIN on file');
    expect(res.body.data.statusUpdatedAt).not.toBeNull();

    const user = await User.findByPk(userId);
    expect(user!.isApproved).toBe(false);
  });

  it('clears a prior rejection reason when later approved', async () => {
    const { vendorId } = await t.newVendor();

    await asAdmin(
      request(t.app.getHttpServer())
        .patch(`/api/admin/vendors/${vendorId}/reject`)
        .send({ reason: 'Missing bank proof' }),
    );
    const res = await asAdmin(
      request(t.app.getHttpServer()).patch(`/api/admin/vendors/${vendorId}/approve`),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
    expect(res.body.data.rejectionReason).toBeNull();
  });

  it('answers 404 for an unknown vendor id', async () => {
    const res = await asAdmin(
      request(t.app.getHttpServer()).patch(
        '/api/admin/vendors/00000000-0000-0000-0000-000000000000/approve',
      ),
    );
    expect(res.status).toBe(404);
  });

  it('answers 403 for a vendor calling the admin approve route', async () => {
    const { vendorId } = await t.newVendor();
    const res = await asVendor(
      request(t.app.getHttpServer()).patch(`/api/admin/vendors/${vendorId}/approve`),
    );
    expect(res.status).toBe(403);
  });
});
