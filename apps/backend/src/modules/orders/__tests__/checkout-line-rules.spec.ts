import { sellerBlockReason } from '../checkout-line-rules';

// Which cart lines checkout refuses because of the seller or the listing.
// Decision 0059 G1 (option A): a vendor whose account is not approved can't
// sell, even if their listings are still marked active.
describe('sellerBlockReason', () => {
  const line = { listing_status: 'active', vendor_is_active: true, vendor_is_approved: true };

  it('allows an active listing from an active, approved vendor', () => {
    expect(sellerBlockReason(line)).toBeNull();
  });

  it('refuses a listing that is not active', () => {
    expect(sellerBlockReason({ ...line, listing_status: 'paused' })).toBe('listing is not active');
  });

  it('refuses a deactivated vendor', () => {
    expect(sellerBlockReason({ ...line, vendor_is_active: false })).toBe('vendor is paused');
  });

  it('refuses a vendor whose account is not approved', () => {
    expect(sellerBlockReason({ ...line, vendor_is_approved: false })).toBe(
      'vendor is not approved',
    );
  });
});
