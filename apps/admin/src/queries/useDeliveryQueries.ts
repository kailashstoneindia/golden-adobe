import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { deliveryService } from '@/services';
import type {
  AssignmentListQuery,
  AssignRequest,
  CreateDriverRequest,
  CreateVehicleRequest,
  DriverDocumentKind,
  DriverListQuery,
  QueueQuery,
  UpdateDriverRequest,
  UpdateVehicleRequest,
} from '@/types/delivery.types';

// Under the backend's 300-second signed-link lifetime.
const DOCUMENT_LINK_REFRESH_MS = 4 * 60 * 1000;

export const deliveryKeys = {
  all: ['delivery'] as const,
  drivers: (query: DriverListQuery) => ['delivery', 'drivers', query] as const,
  driver: (id: string) => ['delivery', 'driver', id] as const,
  vehicles: ['delivery', 'vehicles'] as const,
  queue: (query: QueueQuery) => ['delivery', 'queue', query] as const,
  assignments: (query: AssignmentListQuery) => ['delivery', 'assignments', query] as const,
};

export function useDriversQuery(query: DriverListQuery) {
  return useQuery({
    queryKey: deliveryKeys.drivers(query),
    queryFn: () => deliveryService.drivers.list(query),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useDriverQuery(id: string | null) {
  return useQuery({
    queryKey: deliveryKeys.driver(id ?? ''),
    queryFn: () => deliveryService.drivers.get(id!),
    enabled: id != null,
    staleTime: APP_CONSTANTS.staleTimeMs,
    // Document links are signed for 5 minutes; refresh before they expire.
    refetchInterval: DOCUMENT_LINK_REFRESH_MS,
  });
}

export function useVehiclesQuery() {
  return useQuery({
    queryKey: deliveryKeys.vehicles,
    queryFn: () => deliveryService.vehicles.list(),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

// Every delivery mutation refreshes the whole ['delivery'] tree: a vehicle
// change shows on the drivers list, a driver change frees or takes a vehicle.
// Assignment mutations also move order groups between statuses, so they refresh
// ['orders'] too (see useAssignmentMutation).
function useDeliveryMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  alsoInvalidate: readonly (readonly string[])[] = [],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: deliveryKeys.all }),
        ...alsoInvalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ]);
    },
  });
}

export function useCreateDriverMutation() {
  return useDeliveryMutation((body: CreateDriverRequest) => deliveryService.drivers.create(body));
}

export function useUpdateDriverMutation() {
  return useDeliveryMutation((v: { id: string; body: UpdateDriverRequest }) =>
    deliveryService.drivers.update(v.id, v.body),
  );
}

export function useCreateVehicleMutation() {
  return useDeliveryMutation((body: CreateVehicleRequest) => deliveryService.vehicles.create(body));
}

export function useUpdateVehicleMutation() {
  return useDeliveryMutation((v: { id: string; body: UpdateVehicleRequest }) =>
    deliveryService.vehicles.update(v.id, v.body),
  );
}

export function useConfirmDriverDocumentMutation() {
  return useDeliveryMutation((v: { id: string; kind: DriverDocumentKind; key: string }) =>
    deliveryService.drivers.confirmDocument(v.id, v.kind, v.key),
  );
}

export function useDeliveryQueueQuery(query: QueueQuery) {
  return useQuery({
    queryKey: deliveryKeys.queue(query),
    queryFn: () => deliveryService.assignments.queue(query),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useAssignmentsQuery(query: AssignmentListQuery) {
  return useQuery({
    queryKey: deliveryKeys.assignments(query),
    queryFn: () => deliveryService.assignments.list(query),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useAssignMutation() {
  return useDeliveryMutation(
    (body: AssignRequest) => deliveryService.assignments.assign(body),
    [['orders']],
  );
}

export function useReassignMutation() {
  return useDeliveryMutation(
    (v: { assignmentId: string; driverId: string }) =>
      deliveryService.assignments.reassign(v.assignmentId, v.driverId),
    [['orders']],
  );
}

export function useReattemptMutation() {
  return useDeliveryMutation(
    (v: { groupId: string; driverId: string }) =>
      deliveryService.assignments.reattempt(v.groupId, v.driverId),
    [['orders']],
  );
}
