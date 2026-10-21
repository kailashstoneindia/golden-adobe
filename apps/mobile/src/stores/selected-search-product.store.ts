import type { SearchDocument } from '@golden-abode/types';
import { create } from 'zustand';

type SelectedSearchProductState = {
  selectedProduct: SearchDocument | null;
  setSelectedProduct: (product: SearchDocument) => void;
  clearSelectedProduct: () => void;
};

export const useSelectedSearchProductStore = create<SelectedSearchProductState>((set) => ({
  selectedProduct: null,
  setSelectedProduct: (product) => set({ selectedProduct: product }),
  clearSelectedProduct: () => set({ selectedProduct: null }),
}));
