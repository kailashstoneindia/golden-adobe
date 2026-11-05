import { Vendor } from '../models/vendor.model';
import { toVendorProfileDto } from '../vendor-profile.mapper';

// Global Constraint (decision 0058): a vendor's own GET /vendors/me shape does
// not change; admin-only fields live on AdminVendorDto.
describe('vendor profile shape is pinned', () => {
  it('toVendorProfileDto returns exactly these keys', () => {
    const vendor = {
      id: 'v1',
      userId: 'u1',
      shopName: 'Shop',
      address: 'Addr',
      latitude: 1,
      longitude: 2,
      upiId: null,
      bankDetails: null,
      accountDetails: null,
      gstin: null,
      cityId: null,
      city: null,
      citySource: null,
      hasLoadingUnloadingTeam: null,
      minOrderValue: null,
      status: 'PENDING',
      rejectionReason: null,
      statusUpdatedAt: null,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      updatedAt: new Date('2026-11-01T00:00:00Z'),
      get: (key: string) => (key === 'createdAt' || key === 'updatedAt' ? new Date() : undefined),
    } as unknown as Vendor;

    expect(Object.keys(toVendorProfileDto(vendor)).sort()).toEqual(
      [
        'accountDetails',
        'address',
        'bankDetails',
        'city',
        'cityId',
        'createdAt',
        'gstin',
        'hasLoadingUnloadingTeam',
        'id',
        'latitude',
        'longitude',
        'minOrderValue',
        'rejectionReason',
        'shopName',
        'status',
        'statusUpdatedAt',
        'updatedAt',
        'upiId',
        'userId',
      ].sort(),
    );
  });
});
