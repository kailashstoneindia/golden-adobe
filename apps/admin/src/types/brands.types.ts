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

// POST /admin/brands/:id/logo-upload-url: a presigned S3 POST plus the key to
// confirm once the upload has finished.
export type BrandLogoUploadTicket = {
  url: string;
  fields: Record<string, string>;
  key: string;
};
