export type PaginatedResponse<TItem> = {
  items: TItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
