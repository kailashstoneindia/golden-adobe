import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/server';

import {
  useApproveUserMutation,
  useRejectUserMutation,
  useRevokeUserSessionsMutation,
  useSetUserActiveMutation,
  useUpdateUserMutation,
} from './useAdminQueries';

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

// Whole-branch review: the owner's name, phone and active badge also appear in
// the vendor, ustaad and order popups, so editing a user must refresh them too.
describe('user edit mutations refresh every screen that shows the user', () => {
  function setupEdits() {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    server.use(
      http.patch('/api/admin/users/:id', () => HttpResponse.json({ success: true, data: {} })),
      http.patch('/api/admin/users/:id/active', () =>
        HttpResponse.json({ success: true, data: {} }),
      ),
      http.post('/api/admin/users/:id/revoke-sessions', () =>
        HttpResponse.json({ success: true, data: {} }),
      ),
    );
    return { invalidate, wrapper };
  }

  const keys = (invalidate: { mock: { calls: unknown[][] } }) =>
    invalidate.mock.calls.map(([arg]) => JSON.stringify((arg as { queryKey: unknown }).queryKey));

  it.each([
    ['editing details', () => useUpdateUserMutation(), { userId: 'u1', body: { name: 'X' } }],
    ['switching active', () => useSetUserActiveMutation(), { userId: 'u1', isActive: false }],
  ])('%s refreshes users, vendors, ustaads and orders', async (_label, hook, variables) => {
    const { invalidate, wrapper } = setupEdits();
    const { result } = renderHook(hook as () => { mutateAsync: (v: unknown) => Promise<unknown> }, {
      wrapper,
    });

    await act(() => result.current.mutateAsync(variables));

    expect(keys(invalidate)).toEqual(
      expect.arrayContaining(['["admin"]', '["vendors"]', '["artisans"]', '["orders"]']),
    );
  });

  it('signing a user out refreshes the same screens', async () => {
    const { invalidate, wrapper } = setupEdits();
    const { result } = renderHook(() => useRevokeUserSessionsMutation(), { wrapper });

    await act(() => result.current.mutateAsync('u1'));

    expect(keys(invalidate)).toEqual(
      expect.arrayContaining(['["admin"]', '["vendors"]', '["artisans"]', '["orders"]']),
    );
  });
});
