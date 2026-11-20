import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { readiness } from '@/test/catalogFixtures';
import { server } from '@/test/server';

import { ReadinessChecklist } from './ReadinessChecklist';

const ID = 'p1111111-1111-4111-8111-111111111111';

function renderChecklist(data: ReturnType<typeof readiness>) {
  server.use(
    http.get(`/api/admin/catalog/products/${ID}/readiness`, () =>
      HttpResponse.json({ success: true, data }),
    ),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ReadinessChecklist productId={ID} />
    </QueryClientProvider>,
  );
}

// Decision 0063: a missing HSN code warns (amber); a missing image blocks (red).
describe('ReadinessChecklist', () => {
  it('shows a missing HSN code as a warning and a missing image as a blocker', async () => {
    renderChecklist(readiness({ image: false, hsn_code: false }));

    const list = await screen.findByRole('list', { name: 'Readiness' });
    const hsn = within(list)
      .getByText(/HSN code/)
      .closest('li')!;
    const image = within(list)
      .getByText(/At least one image/)
      .closest('li')!;
    expect(hsn).toHaveAttribute('data-state', 'warning');
    expect(hsn).toHaveTextContent('HSN code (warning)');
    expect(image).toHaveAttribute('data-state', 'blocking');
    expect(image).toHaveTextContent('needs at least one image');
  });

  it('ticks met checks', async () => {
    renderChecklist(readiness({ image: true }));

    const list = await screen.findByRole('list', { name: 'Readiness' });
    expect(
      within(list)
        .getByText(/At least one image/)
        .closest('li'),
    ).toHaveAttribute('data-state', 'ok');
  });
});
