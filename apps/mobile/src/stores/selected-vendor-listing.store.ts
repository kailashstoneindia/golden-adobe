import type { VendorListingStockDto } from '@golden-abode/types';
import { create } from 'zustand';

type SelectedVendorListingState = {
  selectedListing: VendorListingStockDto | null;
  setSelectedListing: (listing: VendorListingStockDto) => void;
  clearSelectedListing: () => void;
};

export const useSelectedVendorListingStore = create<SelectedVendorListingState>((set) => ({
  selectedListing: null,
  setSelectedListing: (listing) => set({ selectedListing: listing }),
  clearSelectedListing: () => set({ selectedListing: null }),
}));
