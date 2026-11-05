import { VendorListingStatus } from '../catalog/models/vendor-listing.model';

export type SellerFacts = {
  listing_status: string;
  vendor_is_active: boolean;
  vendor_is_approved: boolean;
};

// Why checkout refuses a cart line because of the listing or its seller, or
// null when the seller can sell it. Stock and quantity rules are checked
// separately in CheckoutService.
export function sellerBlockReason(line: SellerFacts): string | null {
  if (line.listing_status !== VendorListingStatus.ACTIVE) return 'listing is not active';
  if (!line.vendor_is_active) return 'vendor is paused';
  // Decision 0059 G1: an unapproved vendor's listings can't be bought.
  if (!line.vendor_is_approved) return 'vendor is not approved';
  return null;
}
