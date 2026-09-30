import type { CityDto, VendorCategoryDto, VendorProfileDto } from '@golden-abode/types';

export type SetVendorCityRequest = {
  cityId: string | null;
};

export type SetVendorCategoriesRequest = {
  categoryIds: string[];
};

export type VendorDetailModalProps = {
  vendor: VendorProfileDto;
  cities: CityDto[];
  registeredCategories: VendorCategoryDto[];
  leafCategories: Array<{ id: string; path: string; name: string }>;
  isCitiesLoading: boolean;
  isCategoriesLoading: boolean;
  isSubmitting: boolean;
  actionError: string | null;
  onClose: () => void;
  onSaveCity: (cityId: string | null) => Promise<void>;
  onSaveCategories: (categoryIds: string[]) => Promise<void>;
};

export type VendorDetailRowProps = {
  label: string;
  value: string;
};
