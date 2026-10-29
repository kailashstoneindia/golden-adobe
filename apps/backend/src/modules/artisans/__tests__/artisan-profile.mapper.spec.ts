import { Artisan } from '../models/artisan.model';
import { ArtisanAccountDetails } from '../models/artisan-account-details.model';
import { ArtisanTeamMember } from '../models/artisan-team-member.model';
import { toArtisanProfileDto, toArtisanPublicProfileDto } from '../artisan-profile.mapper';

// Plain objects, not Sequelize .build() — these models aren't registered
// against a Sequelize instance in this unit test, and the mapper only
// reads plain properties plus .get('createdAt'/'updatedAt'), which this
// fixture stubs directly rather than pulling in a real DB connection.
function buildArtisanFixture(overrides: Record<string, unknown> = {}): Artisan {
  const base = {
    id: 'artisan-1',
    userId: 'user-1',
    tradeType: 'PLUMBER',
    experienceYears: 6,
    bio: 'Reliable plumber, 6 years in Bengaluru.',
    servicePincode: '560001',
    documentUrl: 'https://s3/doc.pdf',
    isVerified: true,
    isAvailable: true,
    accountDetails: undefined,
    team: undefined,
    ...overrides,
  };
  return {
    ...base,
    get: (key: string) =>
      key === 'createdAt' || key === 'updatedAt' ? new Date('2026-10-29T00:00:00.000Z') : undefined,
  } as unknown as Artisan;
}

function buildAccountDetailsFixture(): ArtisanAccountDetails {
  return {
    id: 'acct-1',
    artisanId: 'artisan-1',
    accountHolderName: 'Ramesh Kumar',
    bankName: 'SBI',
    ifscCode: 'SBIN0001234',
    branchName: 'Koramangala',
    accountNumber: '1234567890',
    get: () => new Date('2026-10-29T00:00:00.000Z'),
  } as unknown as ArtisanAccountDetails;
}

function buildTeamMemberFixture(): ArtisanTeamMember {
  return {
    id: 'member-1',
    artisanId: 'artisan-1',
    name: 'Suresh',
    roleOnTeam: null,
    phone: null,
    documentUrl: null,
    get: () => new Date('2026-10-29T00:00:00.000Z'),
  } as unknown as ArtisanTeamMember;
}

describe('artisan-profile.mapper', () => {
  it('never includes phone, bank details, or raw document url in the public profile', () => {
    const artisan = buildArtisanFixture({ documentUrl: 'https://s3/doc.pdf' });
    const dto = toArtisanPublicProfileDto(artisan);
    expect(dto).not.toHaveProperty('documentUrl');
    expect(dto).not.toHaveProperty('accountDetails');
    expect(dto).not.toHaveProperty('phone');
    expect(Object.keys(dto).sort()).toEqual(
      ['bio', 'experienceYears', 'id', 'isAvailable', 'isVerified', 'tradeType'].sort(),
    );
  });

  it('toArtisanProfileDto includes account details and team when loaded', () => {
    const fixtureAccountDetails = buildAccountDetailsFixture();
    const fixtureMember = buildTeamMemberFixture();
    const artisan = buildArtisanFixture({
      accountDetails: fixtureAccountDetails,
      team: [fixtureMember],
    });

    const dto = toArtisanProfileDto(artisan);
    expect(dto.accountDetails).toEqual(
      expect.objectContaining({ accountHolderName: fixtureAccountDetails.accountHolderName }),
    );
    expect(dto.team).toHaveLength(1);
  });

  it('toArtisanProfileDto returns null accountDetails and empty team when not loaded', () => {
    const artisan = buildArtisanFixture();
    const dto = toArtisanProfileDto(artisan);
    expect(dto.accountDetails).toBeNull();
    expect(dto.team).toEqual([]);
  });
});
