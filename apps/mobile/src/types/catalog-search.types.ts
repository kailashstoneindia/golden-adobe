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
};

export type SellerRowProps = {
  listing: ProductListingRow;
};
