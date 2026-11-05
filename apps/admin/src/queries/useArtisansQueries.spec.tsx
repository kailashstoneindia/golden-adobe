import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/server';

import {
  useRejectArtisanVerificationMutation,
  useVerifyArtisanMutation,
} from './useArtisansQueries';

const ID = 'a1111111-1111-4111-8111-111111111111';

function setup() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  server.use(
    http.patch(`/api/admin/artisans/${ID}/verify`, () =>
      HttpResponse.json({ success: true, data: {} }),
    ),
    http.patch(`/api/admin/artisans/${ID}/reject-verification`, () =>
      HttpResponse.json({ success: true, data: {} }),
    ),
  );
  return { invalidate, wrapper };
}

// Verify and Reject change users.is_approved too (decision 0058), so the Users
// page must refetch or it shows the old Approved value.
describe('ustaad verification mutations', () => {
  it('Verify refreshes the users list', async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useVerifyArtisanMutation(), { wrapper });

    await act(() => result.current.mutateAsync(ID));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'users'] });
  });

  it('Reject refreshes the users list', async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useRejectArtisanVerificationMutation(), { wrapper });

    await act(() => result.current.mutateAsync({ artisanId: ID, body: {} }));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'users'] });
  });
});
