import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { brand, page } from '@/test/brandFixtures';
import { server } from '@/test/server';

import { brandKeys, useBrandsQuery, useCreateBrandMutation } from './useBrandsQueries';

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

describe('brand queries (decision 0063)', () => {
  it('useBrandsQuery sends the search and active filters', async () => {
    let url = '';
    server.use(
      http.get('/api/admin/brands', ({ request }) => {
        url = request.url;
        return HttpResponse.json({ success: true, data: page([brand()]) });
      }),
    );
    const { wrapper } = setup();

    const { result } = renderHook(() => useBrandsQuery({ search: 'hav', isActive: false }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data?.items).toHaveLength(1));
    const params = new URL(url).searchParams;
    expect(params.get('search')).toBe('hav');
    expect(params.get('isActive')).toBe('false');
  });

  it('a brand mutation refreshes brand and catalog data', async () => {
    server.use(
      http.post('/api/admin/brands', () => HttpResponse.json({ success: true, data: brand() })),
    );
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useCreateBrandMutation(), { wrapper });

    await act(() =>
      result.current.mutateAsync({
        name: 'Havells',
        manufacturerName: 'Havells India Ltd',
        manufacturerAddress: 'Noida',
        consumerCareEmail: 'care@havells.test',
        consumerCarePhone: '+91 1800 11 0303',
      }),
    );

    expect(invalidate).toHaveBeenCalledWith({ queryKey: brandKeys.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['catalog'] });
  });
});
