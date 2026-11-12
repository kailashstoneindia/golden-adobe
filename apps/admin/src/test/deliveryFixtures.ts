import type { AdminDriverDto, VehicleDto } from '@golden-abode/types';

export function vehicle(over: Partial<VehicleDto> = {}): VehicleDto {
  return {
    id: 'v1111111-1111-4111-8111-111111111111',
    registrationNumber: 'DL1CAB1234',
    type: 'Tempo',
    notes: null,
    isActive: true,
    ...over,
  };
}

export function driver(over: Partial<AdminDriverDto> = {}): AdminDriverDto {
  return {
    id: 'd1111111-1111-4111-8111-111111111111',
    userId: 'u1111111-1111-4111-8111-111111111111',
    name: 'Ramesh Kumar',
    phone: '+919876543210',
    isActive: true,
    licenceNumber: 'DL-0420110012345',
    helperName: 'Suresh',
    helperPhone: '+919876500000',
    vehicle: vehicle(),
    licenceDocViewUrl: null,
    aadhaarDocViewUrl: null,
    ...over,
  };
}
