import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/server';

import {
  deliveryKeys,
  useCreateDriverMutation,
  useAssignMutation,
  useAssignmentsQuery,
  useCreateVehicleMutation,
  useDeliveryQueueQuery,
  useReassignMutation,
  useReattemptMutation,
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

describe('assignment queries (decision 0060)', () => {
  it('useDeliveryQueueQuery calls GET /admin/delivery/queue with paging', async () => {
    let url = '';
    server.use(
      http.get('/api/admin/delivery/queue', ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          success: true,
          data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
        });
      }),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useDeliveryQueueQuery({ page: 2, pageSize: 10 }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(new URL(url).searchParams.get('page')).toBe('2');
    expect(new URL(url).searchParams.get('pageSize')).toBe('10');
  });

  it('useAssignmentsQuery sends the status and driver filters', async () => {
    let url = '';
    server.use(
      http.get('/api/admin/delivery/assignments', ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          success: true,
          data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
        });
      }),
    );
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useAssignmentsQuery({ status: 'failed', driverId: ID, page: 1, pageSize: 20 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(new URL(url).searchParams.get('status')).toBe('failed');
    expect(new URL(url).searchParams.get('driverId')).toBe(ID);
  });

  it('assign, reassign and reattempt post to the right routes and refresh delivery and orders', async () => {
    const calls: string[] = [];
    server.use(
      http.post('/api/admin/delivery/assignments', async ({ request }) => {
        calls.push('assign ' + JSON.stringify(await request.json()));
        return HttpResponse.json({ success: true, data: {} }, { status: 201 });
      }),
      http.post(`/api/admin/delivery/assignments/${ID}/reassign`, async ({ request }) => {
        calls.push('reassign ' + JSON.stringify(await request.json()));
        return HttpResponse.json({ success: true, data: {} }, { status: 201 });
      }),
      http.post(`/api/admin/delivery/groups/${ID}/reattempt`, async ({ request }) => {
        calls.push('reattempt ' + JSON.stringify(await request.json()));
        return HttpResponse.json({ success: true, data: {} }, { status: 201 });
      }),
    );
    const { invalidate, wrapper } = setup();
    const assign = renderHook(() => useAssignMutation(), { wrapper });
    const reassign = renderHook(() => useReassignMutation(), { wrapper });
    const reattempt = renderHook(() => useReattemptMutation(), { wrapper });

    await act(() => assign.result.current.mutateAsync({ orderVendorGroupId: ID, driverId: 'd9' }));
    await act(() => reassign.result.current.mutateAsync({ assignmentId: ID, driverId: 'd8' }));
    await act(() => reattempt.result.current.mutateAsync({ groupId: ID, driverId: 'd7' }));

    expect(calls).toEqual([
      `assign {"orderVendorGroupId":"${ID}","driverId":"d9"}`,
      'reassign {"driverId":"d8"}',
      'reattempt {"driverId":"d7"}',
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: deliveryKeys.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['orders'] });
  });
});
