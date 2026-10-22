import type { ProductListingRow } from '@golden-abode/types';

export type CatalogSearchParams = {
  q?: string;
  category?: string;
};

export type OtherSellersListProps = {
  listings: ProductListingRow[];
  isLoading: boolean;
  isError: boolean;
  hasSearchLocation: boolean;
  selectedVendorListingId: string | null;
  onSelectListing: (listing: ProductListingRow) => void;
};

export type SellerRowProps = {
  listing: ProductListingRow;
  isSelected: boolean;
  onPress: () => void;
};

export type SelectableSellerRowProps = {
  listing: ProductListingRow;
  isSelected: boolean;
  onSelectListing: (listing: ProductListingRow) => void;
};

export type SellersMessageProps = {
  message: string;
};
