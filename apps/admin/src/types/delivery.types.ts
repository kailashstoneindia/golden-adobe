// Request bodies for the delivery admin API (decision 0060). The response
// shapes (AdminDriverDto, VehicleDto) live in @golden-abode/types.
export type DriverDocumentKind = 'licence' | 'aadhaar';

export interface DriverListQuery {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

export interface CreateDriverRequest {
  name: string;
  phone: string;
  licenceNumber: string;
  helperName?: string;
  helperPhone?: string;
  vehicleId?: string;
}

export interface UpdateDriverRequest {
  name?: string;
  phone?: string;
  licenceNumber?: string;
  helperName?: string | null;
  helperPhone?: string | null;
  vehicleId?: string | null;
}

export interface CreateVehicleRequest {
  registrationNumber: string;
  type: string;
  notes?: string;
}

export interface UpdateVehicleRequest {
  type?: string;
  notes?: string;
  isActive?: boolean;
}

// Same shape as a product-image ticket, plus the key to confirm with.
export interface DriverDocumentUploadTicket {
  url: string;
  fields: Record<string, string>;
  key: string;
}
