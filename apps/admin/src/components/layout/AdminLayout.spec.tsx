import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { getFreshAccessToken } from '@/services/api/tokenRefresh';
import { tokenStorage } from '@/services/storage/tokenStorage';
import { server } from '@/test/server';

import { AdminLayout } from './AdminLayout';

const LOGOUT = '/api/auth/logout';

function renderLayout() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<p>Dashboard body</p>} />
        </Route>
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  tokenStorage.setTokens('a1', 'r1');
});

describe('AdminLayout log out', () => {
  it('revokes the refresh token on the server', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(LOGOUT, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ success: true, data: { message: 'Logged out successfully' } });
      }),
    );
    renderLayout();

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(bodies).toEqual([{ refreshToken: 'r1' }]));
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });

  it('waits for an in-flight token refresh, then revokes the new token', async () => {
    // Revoking r1 while a refresh with r1 is in flight would make the backend
    // see r1 reused and revoke every session of this admin.
    let releaseRefresh!: () => void;
    const refreshHeld = new Promise<void>((resolve) => (releaseRefresh = resolve));
    const logoutBodies: unknown[] = [];
    server.use(
      http.post('/api/auth/refresh', async () => {
        await refreshHeld;
        return HttpResponse.json({
          success: true,
          data: { accessToken: 'a2', refreshToken: 'r2' },
        });
      }),
      http.post(LOGOUT, async ({ request }) => {
        logoutBodies.push(await request.json());
        return HttpResponse.json({ success: true, data: { message: 'ok' } });
      }),
    );
    renderLayout();
    const pending = getFreshAccessToken('a1').catch(() => undefined);

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(logoutBodies).toEqual([]);
    releaseRefresh();
    await pending;

    await waitFor(() => expect(logoutBodies).toEqual([{ refreshToken: 'r2' }]));
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });

  it('still logs out locally when the server call fails', async () => {
    server.use(http.post(LOGOUT, () => HttpResponse.json({ success: false }, { status: 500 })));
    renderLayout();

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });
});
