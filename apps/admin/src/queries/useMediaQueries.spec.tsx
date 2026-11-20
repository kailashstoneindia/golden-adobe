import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CATALOG_QUERY_KEYS } from './useCatalogQueries';
import { MEDIA_QUERY_KEYS, useRefreshProductMedia } from './useMediaQueries';

const ID = 'p1111111-1111-4111-8111-111111111111';

describe('useRefreshProductMedia', () => {
  // Decision 0063: an image added or removed changes whether the product can
  // be published, so the readiness checklist must refresh with the images.
  it('refreshes the images, the product and its readiness checklist', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useRefreshProductMedia(ID), { wrapper });

    await act(() => result.current());

    expect(invalidate).toHaveBeenCalledWith({ queryKey: MEDIA_QUERY_KEYS.list(ID) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: CATALOG_QUERY_KEYS.product(ID) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: CATALOG_QUERY_KEYS.readiness(ID) });
  });
});
