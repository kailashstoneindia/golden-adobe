import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/server';

import { useApproveUserMutation, useRejectUserMutation } from './useAdminQueries';

function setup() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  server.use(
    http.patch('/api/admin/users/:id/approve', () =>
      HttpResponse.json({ success: true, data: {} }),
    ),
    http.patch('/api/admin/users/:id/reject', () => HttpResponse.json({ success: true, data: {} })),
  );
  return { invalidate, wrapper };
}

// For an ustaad, approve/reject on the users page runs Verify/Reject
// (decision 0058 §3b), so the ustaad lists must refetch too.
describe('user approval mutations', () => {
  it('approve refreshes the ustaad lists', async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useApproveUserMutation(), { wrapper });

    await act(() => result.current.mutateAsync('u1'));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['artisans'] });
  });

  it('reject refreshes the ustaad lists', async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useRejectUserMutation(), { wrapper });

    await act(() => result.current.mutateAsync({ userId: 'u1' }));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['artisans'] });
  });
});

// Follow-up F2: for a vendor, users-page approve/reject also changes the
// vendor record, so the Vendors page must refetch.
describe('user approval mutations and the vendors list', () => {
  it('approve and reject refresh the vendors list', async () => {
    const { invalidate, wrapper } = setup();
    const approve = renderHook(() => useApproveUserMutation(), { wrapper });
    const reject = renderHook(() => useRejectUserMutation(), { wrapper });

    await act(() => approve.result.current.mutateAsync('u1'));
    await act(() => reject.result.current.mutateAsync({ userId: 'u1', reason: 'x' }));

    expect(
      invalidate.mock.calls.filter(([arg]) => JSON.stringify(arg) === '{"queryKey":["vendors"]}'),
    ).toHaveLength(2);
  });
});
