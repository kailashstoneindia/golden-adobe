import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { deliveryService } from '@/services';
import type {
  CreateDriverRequest,
  CreateVehicleRequest,
  DriverDocumentKind,
  DriverListQuery,
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
function useDeliveryMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.all }),
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
