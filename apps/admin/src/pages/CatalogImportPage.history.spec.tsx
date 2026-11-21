import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogImportJobDto } from '@golden-abode/types';

import { categoryTree, importJob } from '@/test/catalogFixtures';
import { server } from '@/test/server';

import { CatalogImportPage } from './CatalogImportPage';

const DONE = importJob({
  status: 'done',
  processedRows: 6,
  totalRows: 6,
  acceptedCount: 5,
  rejectedCount: 1,
  hasErrorFile: true,
  finishedAt: '2026-11-21T09:01:00.000Z',
});
const UNDONE = importJob({
  id: 'j2222222-2222-4222-8222-222222222222',
  status: 'done',
  acceptedCount: 3,
  rejectedCount: 0,
  undone: true,
  finishedAt: '2026-11-20T09:01:00.000Z',
});

let jobs: CatalogImportJobDto[];
let calls: string[];

beforeEach(() => {
  jobs = [DONE, UNDONE];
  calls = [];
  server.use(
    http.get('/api/admin/catalog/categories', () =>
      HttpResponse.json({ success: true, data: categoryTree() }),
    ),
    http.get('/api/admin/catalog-import/jobs', () =>
      HttpResponse.json({
        success: true,
        data: { items: jobs, total: jobs.length, page: 1, limit: 10, totalPages: 1 },
      }),
    ),
    http.get(`/api/admin/catalog-import/jobs/${DONE.id}/errors`, () => {
      calls.push('errors');
      return HttpResponse.json({
        success: true,
        data: { url: 'https://signed.test/rejected.xlsx' },
      });
    }),
    http.post(`/api/admin/catalog-import/jobs/${DONE.id}/undo`, () => {
      calls.push('undo');
      jobs = [{ ...DONE, undone: true }, UNDONE];
      return HttpResponse.json({ success: true, data: { deleted: 4, kept: 1 } }, { status: 201 });
    }),
  );
});

afterEach(() => vi.restoreAllMocks());

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CatalogImportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CatalogImportPage past imports (decision 0063)', () => {
  it('lists past imports with category, who, counts and status', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Past imports' });

    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('electrical/switches');
    expect(rows[0]).toHaveTextContent('Asha Admin');
    expect(rows[0]).toHaveTextContent('5 accepted, 1 rejected');
    expect(rows[0]).toHaveTextContent('Done');
    expect(rows[1]).toHaveTextContent('Undone');
    expect(within(rows[1]).queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('downloads the rejected rows of an import that had any', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderPage();
    const table = await screen.findByRole('table', { name: 'Past imports' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(
      within(rows[1]).queryByRole('button', { name: 'Download rejected rows' }),
    ).not.toBeInTheDocument();

    await userEvent.click(within(rows[0]).getByRole('button', { name: 'Download rejected rows' }));

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith('https://signed.test/rejected.xlsx', '_blank'),
    );
    expect(calls).toEqual(['errors']);
  });

  it('undoes an import after a confirmation and reports what was kept', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Past imports' });
    const first = within(table).getAllByRole('row')[1];

    await userEvent.click(within(first).getByRole('button', { name: 'Undo' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Undo this import?' });
    expect(
      within(confirm).getByText(
        'Deletes 5 draft products from this import; products that already have listings are kept.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Undo import' }));

    expect(await screen.findByText('Deleted 4, kept 1.')).toBeInTheDocument();
    expect(calls).toEqual(['undo']);
    await waitFor(() => expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Undone'));
  });

  it('explains where imports will appear when there are none', async () => {
    jobs = [];
    renderPage();

    expect(
      await screen.findByText(
        'No imports yet. Each upload appears here with its progress, results and an undo.',
      ),
    ).toBeInTheDocument();
  });
});
