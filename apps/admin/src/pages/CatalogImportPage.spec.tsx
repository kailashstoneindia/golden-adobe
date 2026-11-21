import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CatalogImportJobDto } from '@golden-abode/types';

import { categoryTree, importJob, JOB_ID, LEAF_ID } from '@/test/catalogFixtures';
import { server } from '@/test/server';

import { CatalogImportPage } from './CatalogImportPage';

let job: CatalogImportJobDto;
let uploadStatus: number;

beforeEach(() => {
  job = importJob();
  uploadStatus = 202;
  server.use(
    http.get('/api/admin/catalog/categories', () =>
      HttpResponse.json({ success: true, data: categoryTree() }),
    ),
    http.get('/api/admin/catalog-import/jobs', () =>
      HttpResponse.json({
        success: true,
        data: { items: [], total: 0, page: 1, limit: 10, totalPages: 0 },
      }),
    ),
    http.get(`/api/admin/catalog-import/jobs/${JOB_ID}`, () =>
      HttpResponse.json({ success: true, data: job }),
    ),
    http.post(`/api/admin/catalog-import/${LEAF_ID}`, () =>
      uploadStatus === 202
        ? HttpResponse.json({ success: true, data: { jobId: JOB_ID } }, { status: 202 })
        : HttpResponse.json(
            { success: false, message: 'File too large', statusCode: 413 },
            { status: 413 },
          ),
    ),
  );
});

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

async function upload() {
  renderPage();
  await userEvent.click(await screen.findByRole('button', { name: 'Select a category…' }));
  await userEvent.click(await screen.findByRole('option', { name: /Switches/ }));
  await userEvent.upload(
    screen.getByLabelText('Filled template (.xlsx)'),
    new File([new Uint8Array(64)], 'switches.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Upload' }));
}

describe('CatalogImportPage background import (decision 0063)', () => {
  it('starts a job, shows its progress, then the accepted and rejected counts', async () => {
    await upload();

    expect(await screen.findByText('Import started')).toBeInTheDocument();
    expect(await screen.findByText('120 of 400 rows')).toBeInTheDocument();

    job = importJob({
      status: 'done',
      processedRows: 400,
      acceptedCount: 380,
      rejectedCount: 20,
      hasErrorFile: true,
      finishedAt: '2026-11-21T09:01:00.000Z',
    });

    expect(
      await screen.findByText('Done: 380 accepted, 20 rejected', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('shows why a job failed', async () => {
    job = importJob({
      status: 'failed',
      failureMessage: 'The file could not be read as an Excel workbook (.xlsx)',
    });
    await upload();

    expect(
      await screen.findByText('Failed: The file could not be read as an Excel workbook (.xlsx)'),
    ).toBeInTheDocument();
  });

  it('shows the server’s message when the file is too large', async () => {
    uploadStatus = 413;
    await upload();

    expect(await screen.findByText('File too large')).toBeInTheDocument();
    expect(screen.queryByText('Import started')).not.toBeInTheDocument();
  });
});
