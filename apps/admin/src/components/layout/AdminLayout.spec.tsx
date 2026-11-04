import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

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

  it('still logs out locally when the server call fails', async () => {
    server.use(http.post(LOGOUT, () => HttpResponse.json({ success: false }, { status: 500 })));
    renderLayout();

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });
});
