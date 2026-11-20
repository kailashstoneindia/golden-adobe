// Decision 0063: request shapes for the admin brands API.

export type BrandListFilters = {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
};

export type BrandFormValues = {
  name: string;
  manufacturerName: string;
  manufacturerAddress: string;
  consumerCareEmail: string;
  consumerCarePhone: string;
};
