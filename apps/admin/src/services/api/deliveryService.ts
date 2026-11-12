import type {
  AdminAssignmentDto,
  AdminDriverDto,
  PaginatedResponse,
  QueueItemDto,
  VehicleDto,
} from '@golden-abode/types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import { getRequest, patchRequest, postRequest } from '@/services/api/apiClient';
import type {
  AssignmentListQuery,
  AssignRequest,
  CreateDriverRequest,
  CreateVehicleRequest,
  DriverDocumentKind,
  DriverDocumentUploadTicket,
  DriverListQuery,
  QueueQuery,
  UpdateDriverRequest,
  UpdateVehicleRequest,
} from '@/types/delivery.types';

function driverQueryString(query: DriverListQuery): string {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.search) params.set('search', query.search);
  if (query.isActive !== undefined) params.set('isActive', String(query.isActive));
  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

function pagedQueryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

const endpoints = API_ENDPOINTS.delivery;

export const deliveryService = {
  assignments: {
    queue(query: QueueQuery): Promise<PaginatedResponse<QueueItemDto>> {
      return getRequest<PaginatedResponse<QueueItemDto>>(
        `${endpoints.queue}${pagedQueryString({ ...query })}`,
      );
    },
    list(query: AssignmentListQuery): Promise<PaginatedResponse<AdminAssignmentDto>> {
      return getRequest<PaginatedResponse<AdminAssignmentDto>>(
        `${endpoints.assignments}${pagedQueryString({ ...query })}`,
      );
    },
    assign(body: AssignRequest): Promise<AdminAssignmentDto> {
      return postRequest<AdminAssignmentDto, AssignRequest>(endpoints.assignments, body);
    },
    reassign(assignmentId: string, driverId: string): Promise<AdminAssignmentDto> {
      return postRequest<AdminAssignmentDto, { driverId: string }>(
        endpoints.assignmentReassign(assignmentId),
        { driverId },
      );
    },
    reattempt(groupId: string, driverId: string): Promise<AdminAssignmentDto> {
      return postRequest<AdminAssignmentDto, { driverId: string }>(
        endpoints.groupReattempt(groupId),
        { driverId },
      );
    },
  },

  vehicles: {
    list(): Promise<VehicleDto[]> {
      return getRequest<VehicleDto[]>(endpoints.vehicles);
    },
    create(body: CreateVehicleRequest): Promise<VehicleDto> {
      return postRequest<VehicleDto, CreateVehicleRequest>(endpoints.vehicles, body);
    },
    update(id: string, body: UpdateVehicleRequest): Promise<VehicleDto> {
      return patchRequest<VehicleDto, UpdateVehicleRequest>(endpoints.vehicleById(id), body);
    },
  },

  drivers: {
    list(query: DriverListQuery): Promise<PaginatedResponse<AdminDriverDto>> {
      return getRequest<PaginatedResponse<AdminDriverDto>>(
        `${endpoints.drivers}${driverQueryString(query)}`,
      );
    },
    get(id: string): Promise<AdminDriverDto> {
      return getRequest<AdminDriverDto>(endpoints.driverById(id));
    },
    create(body: CreateDriverRequest): Promise<AdminDriverDto> {
      return postRequest<AdminDriverDto, CreateDriverRequest>(endpoints.drivers, body);
    },
    update(id: string, body: UpdateDriverRequest): Promise<AdminDriverDto> {
      return patchRequest<AdminDriverDto, UpdateDriverRequest>(endpoints.driverById(id), body);
    },
    createDocumentUploadUrl(
      id: string,
      kind: DriverDocumentKind,
      contentType: string,
    ): Promise<DriverDocumentUploadTicket> {
      return postRequest<
        DriverDocumentUploadTicket,
        { kind: DriverDocumentKind; contentType: string }
      >(endpoints.driverDocumentUploadUrl(id), { kind, contentType });
    },
    confirmDocument(id: string, kind: DriverDocumentKind, key: string): Promise<AdminDriverDto> {
      return postRequest<AdminDriverDto, { kind: DriverDocumentKind; key: string }>(
        endpoints.driverDocumentConfirm(id),
        { kind, key },
      );
    },
  },
};
