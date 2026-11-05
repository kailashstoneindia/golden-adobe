import { Logger } from '@nestjs/common';
import request from 'supertest';

import { ArtisansTestApp, createArtisansTestApp } from './artisans-test-app';
import { Artisan } from '../models/artisan.model';
import { ArtisanAccountDetails } from '../models/artisan-account-details.model';
import { ArtisanHireRequest } from '../models/artisan-hire-request.model';
import { ArtisanTeamMember } from '../models/artisan-team-member.model';
import { User } from '../../users/models/user.model';

jest.setTimeout(60_000);

const BANK = {
  accountHolderName: 'Ramesh Kumar',
  bankName: 'State Bank of India',
  ifscCode: 'sbin0001234',
  branchName: 'Koramangala',
  accountNumber: '123456789012',
};

const MISSING = '11111111-1111-4111-8111-111111111111';

// Decision 0058 Task 11: the admin fixes an ustaad's profile and bank details
// and corrects or removes a team member.
describe('Admin ustaad edits (real HTTP, Postgres)', () => {
  let t: ArtisansTestApp;
  let artisanId: string;
  const server = () => t.app.getHttpServer();
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${t.adminToken}`);
  const asArtisan = (req: request.Test) => req.set('Authorization', `Bearer ${t.artisanToken}`);
  const asCustomer = (req: request.Test) => req.set('Authorization', `Bearer ${t.customerToken}`);
  const logLines = (spy: jest.SpyInstance) => spy.mock.calls.map((call) => String(call[0]));
  const stored = async () => (await Artisan.findByPk(artisanId))!.get({ plain: true });

  beforeAll(async () => {
    t = await createArtisansTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    const res = await asArtisan(
      request(server())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'MASON', servicePincode: '560001' }),
    );
    artisanId = res.body.data.id;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await ArtisanHireRequest.destroy({ where: { artisanId } });
    await ArtisanTeamMember.destroy({ where: { artisanId } });
    await ArtisanAccountDetails.destroy({ where: { artisanId } });
    await Artisan.destroy({ where: { id: artisanId } });
    await User.update({ email: null }, { where: { id: t.artisanUserId } });
  });

  const patchProfile = (id: string, body: object) =>
    asAdmin(request(server()).patch(`/api/admin/artisans/${id}`)).send(body);
  const putBank = (id: string, body: object) =>
    asAdmin(request(server()).put(`/api/admin/artisans/${id}/account-details`)).send(body);

  describe('PATCH /admin/artisans/:id', () => {
    it('changes only the fields sent and answers with the admin view', async () => {
      const before = await stored();

      const res = await patchProfile(artisanId, {
        tradeType: 'PLUMBER',
        experienceYears: 9,
        bio: '  Fixes leaks fast ',
        isAvailable: false,
      });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: artisanId,
        tradeType: 'PLUMBER',
        experienceYears: 9,
        bio: 'Fixes leaks fast',
        isAvailable: false,
        servicePincode: '560001',
        owner: { userId: t.artisanUserId },
      });
      // Editing a profile never touches the verification decision.
      expect((await stored()).isVerified).toBe(before.isVerified);
    });

    it.each([
      ['an unknown field (isVerified)', { isVerified: true }],
      ['an unknown field (userId)', { userId: MISSING }],
      ['an unknown field (documentUrl)', { documentUrl: 'artisans/x/y.pdf' }],
      ['a trade that does not exist', { tradeType: 'WIZARD' }],
      ['negative experience', { experienceYears: -1 }],
      ['a blank bio', { bio: '   ' }],
      ['a null bio', { bio: null }],
      ['a null trade', { tradeType: null }],
      ['a null availability', { isAvailable: null }],
    ])('refuses %s with 400 and changes nothing', async (_name, body) => {
      const before = await stored();

      const res = await patchProfile(artisanId, body);

      expect(res.status).toBe(400);
      expect(await stored()).toEqual(before);
    });

    it('404s for an unknown ustaad and 400s for a malformed id', async () => {
      expect((await patchProfile(MISSING, { bio: 'X' })).status).toBe(404);
      expect((await patchProfile('nope', { bio: 'X' })).status).toBe(400);
    });

    it('is closed to an ustaad and to a customer', async () => {
      const own = await asArtisan(request(server()).patch(`/api/admin/artisans/${artisanId}`)).send(
        {
          bio: 'Mine',
        },
      );
      const other = await asCustomer(
        request(server()).patch(`/api/admin/artisans/${artisanId}`),
      ).send({
        bio: 'Theirs',
      });

      expect([own.status, other.status]).toEqual([403, 403]);
    });

    it('logs which admin changed which fields, and only those that changed', async () => {
      await patchProfile(artisanId, { bio: 'Same bio' });
      const log = jest.spyOn(Logger.prototype, 'log');

      await patchProfile(artisanId, { bio: 'Same bio', experienceYears: 4 });

      expect(logLines(log)).toContain(
        `admin ${t.adminUserId} update artisan ${artisanId} experienceYears`,
      );
    });

    it('logs nothing when nothing changed', async () => {
      const log = jest.spyOn(Logger.prototype, 'log');

      const res = await patchProfile(artisanId, { servicePincode: '560001' });

      expect(res.status).toBe(200);
      expect(logLines(log).filter((line) => line.startsWith('admin '))).toEqual([]);
    });
  });

  describe('PUT /admin/artisans/:id/account-details', () => {
    it('creates the bank record, upper-casing the IFSC, then updates the same row', async () => {
      const first = await putBank(artisanId, BANK);

      expect(first.status).toBe(200);
      expect(first.body.data.accountDetails).toMatchObject({ ...BANK, ifscCode: 'SBIN0001234' });

      const second = await putBank(artisanId, {
        ...BANK,
        bankName: 'HDFC Bank',
        ifscCode: 'HDFC0000123',
      });

      expect(second.body.data.accountDetails).toMatchObject({ bankName: 'HDFC Bank' });
      expect(await ArtisanAccountDetails.count({ where: { artisanId } })).toBe(1);
    });

    it.each(['accountHolderName', 'bankName', 'ifscCode', 'branchName', 'accountNumber'])(
      'needs the complete set: refuses a missing %s',
      async (field) => {
        const rest: Partial<typeof BANK> = { ...BANK };
        delete rest[field as keyof typeof BANK];

        expect((await putBank(artisanId, rest)).status).toBe(400);
      },
    );

    it('refuses an unknown field', async () => {
      expect((await putBank(artisanId, { ...BANK, artisanId: MISSING })).status).toBe(400);
    });

    it('404s for an unknown ustaad, and is closed to an ustaad', async () => {
      expect((await putBank(MISSING, BANK)).status).toBe(404);
      const own = await asArtisan(
        request(server()).put(`/api/admin/artisans/${artisanId}/account-details`),
      ).send(BANK);
      expect(own.status).toBe(403);
    });

    it('logs the field names that changed and never the account number', async () => {
      await putBank(artisanId, { ...BANK, ifscCode: 'SBIN0001234' });
      const log = jest.spyOn(Logger.prototype, 'log');

      await putBank(artisanId, { ...BANK, ifscCode: 'SBIN0001234', accountNumber: '999988887777' });

      const lines = logLines(log);
      expect(lines).toContain(
        `admin ${t.adminUserId} update artisan-bank ${artisanId} accountNumber`,
      );
      expect(lines.join('\n')).not.toContain('999988887777');
    });
  });

  describe('team members', () => {
    let memberId: string;

    beforeEach(async () => {
      const res = await asArtisan(
        request(server())
          .post('/api/artisans/me/team')
          .send({ name: 'Suresh', roleOnTeam: 'Helper', phone: '9876543210' }),
      );
      memberId = res.body.data.id;
    });

    const patchMember = (id: string, member: string, body: object) =>
      asAdmin(request(server()).patch(`/api/admin/artisans/${id}/team/${member}`)).send(body);
    const removeMember = (id: string, member: string) =>
      asAdmin(request(server()).delete(`/api/admin/artisans/${id}/team/${member}`));

    it('corrects a member’s name, role and phone, and answers with the ustaad', async () => {
      const res = await patchMember(artisanId, memberId, {
        name: ' Suresh Kumar ',
        roleOnTeam: 'Mason',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(artisanId);
      expect(res.body.data.team).toEqual([
        expect.objectContaining({
          id: memberId,
          name: 'Suresh Kumar',
          roleOnTeam: 'Mason',
          phone: '9876543210',
        }),
      ]);
    });

    it.each([
      ['an unknown field (artisanId)', { artisanId: MISSING }],
      [
        'the document (admins do not upload on an ustaad’s behalf)',
        { documentUrl: 'artisans/x/y.pdf' },
      ],
      ['a blank name', { name: '  ' }],
      ['a null name', { name: null }],
      ['a null phone', { phone: null }],
    ])('refuses %s with 400 and changes nothing', async (_name, body) => {
      const before = (await ArtisanTeamMember.findByPk(memberId))!.get({ plain: true });

      expect((await patchMember(artisanId, memberId, body)).status).toBe(400);
      expect((await ArtisanTeamMember.findByPk(memberId))!.get({ plain: true })).toEqual(before);
    });

    it('404s for a member that belongs to a different ustaad, and for an unknown one', async () => {
      const otherUser = await t.newArtisanUser();
      const other = await Artisan.create({ userId: otherUser.id, tradeType: 'PLUMBER' } as never);
      const theirs = await ArtisanTeamMember.create({
        artisanId: other.id,
        name: 'Not yours',
      } as never);

      expect((await patchMember(artisanId, theirs.id, { name: 'Hijack' })).status).toBe(404);
      expect((await removeMember(artisanId, theirs.id)).status).toBe(404);
      expect((await patchMember(artisanId, MISSING, { name: 'X' })).status).toBe(404);
      expect((await ArtisanTeamMember.findByPk(theirs.id))!.name).toBe('Not yours');
      await ArtisanTeamMember.destroy({ where: { artisanId: other.id } });
      await Artisan.destroy({ where: { id: other.id } });
    });

    it('removes a member, and answers with the ustaad', async () => {
      const res = await removeMember(artisanId, memberId);

      expect(res.status).toBe(200);
      expect(res.body.data.team).toEqual([]);
      expect(await ArtisanTeamMember.findByPk(memberId)).toBeNull();
    });

    it('is closed to an ustaad and to a customer', async () => {
      const own = await asArtisan(
        request(server()).delete(`/api/admin/artisans/${artisanId}/team/${memberId}`),
      );
      const other = await asCustomer(
        request(server()).patch(`/api/admin/artisans/${artisanId}/team/${memberId}`),
      ).send({ name: 'X' });

      expect([own.status, other.status]).toEqual([403, 403]);
      expect(await ArtisanTeamMember.findByPk(memberId)).not.toBeNull();
    });

    it('logs the edit (field names) and the removal', async () => {
      const log = jest.spyOn(Logger.prototype, 'log');

      await patchMember(artisanId, memberId, { name: 'Suresh Kumar', phone: '9876543210' });
      await removeMember(artisanId, memberId);

      const lines = logLines(log);
      expect(lines).toContain(`admin ${t.adminUserId} update artisan-team ${memberId} name`);
      expect(lines).toContain(`admin ${t.adminUserId} remove artisan-team ${memberId}`);
    });
  });
});
