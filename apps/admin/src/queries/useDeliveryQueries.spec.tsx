import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/server';

import {
  deliveryKeys,
  useCreateDriverMutation,
  useCreateVehicleMutation,
  useDriversQuery,
  useUpdateDriverMutation,
  useUpdateVehicleMutation,
  useVehiclesQuery,
} from './useDeliveryQueries';

const ID = 'd1111111-1111-4111-8111-111111111111';

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

describe('delivery queries (decision 0060)', () => {
  it('useDriversQuery calls GET /admin/drivers with the filters', async () => {
    let url = '';
    server.use(
      http.get('/api/admin/drivers', ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          success: true,
          data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
        });
      }),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useDriversQuery({ page: 2, limit: 20, search: 'ram' }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(new URL(url).searchParams.get('page')).toBe('2');
    expect(new URL(url).searchParams.get('search')).toBe('ram');
  });

  it('useVehiclesQuery calls GET /admin/vehicles', async () => {
    server.use(
      http.get('/api/admin/vehicles', () => HttpResponse.json({ success: true, data: [] })),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useVehiclesQuery(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it('useCreateDriverMutation posts to /admin/drivers and refreshes delivery data', async () => {
    let body: unknown;
    server.use(
      http.post('/api/admin/drivers', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, data: { id: ID } });
      }),
    );
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateDriverMutation(), { wrapper });

    await act(() =>
      result.current.mutateAsync({ name: 'Ram', phone: '+919876543210', licenceNumber: 'DL1' }),
    );

    expect(body).toEqual({ name: 'Ram', phone: '+919876543210', licenceNumber: 'DL1' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: deliveryKeys.all });
  });

  it('useUpdateDriverMutation patches /admin/drivers/:id and refreshes delivery data', async () => {
    server.use(
      http.patch(`/api/admin/drivers/${ID}`, () =>
        HttpResponse.json({ success: true, data: { id: ID } }),
      ),
    );
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useUpdateDriverMutation(), { wrapper });
    await act(() => result.current.mutateAsync({ id: ID, body: { vehicleId: null } }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: deliveryKeys.all });
  });

  it('vehicle mutations hit /admin/vehicles and refresh delivery data', async () => {
    server.use(
      http.post('/api/admin/vehicles', () =>
        HttpResponse.json({ success: true, data: { id: ID } }),
      ),
      http.patch(`/api/admin/vehicles/${ID}`, () =>
        HttpResponse.json({ success: true, data: { id: ID } }),
      ),
    );
    const { invalidate, wrapper } = setup();
    const create = renderHook(() => useCreateVehicleMutation(), { wrapper });
    const update = renderHook(() => useUpdateVehicleMutation(), { wrapper });
    await act(() =>
      create.result.current.mutateAsync({ registrationNumber: 'DL1', type: 'Tempo' }),
    );
    await act(() => update.result.current.mutateAsync({ id: ID, body: { isActive: false } }));
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: deliveryKeys.all });
  });
});
