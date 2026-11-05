import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('clears the tokens while holding the cross-tab refresh lock', async () => {
    // Another tab waiting on the lock must find no refresh token, or it would
    // refresh with the one being revoked (reuse → every session revoked).
    let insideLock: string | null | undefined;
    const request = vi.fn(async (_name: string, callback: () => unknown) => {
      const result = await callback();
      insideLock = tokenStorage.getRefreshToken();
      return result;
    });
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    const bodies: unknown[] = [];
    server.use(
      http.post(LOGOUT, async ({ request: req }) => {
        bodies.push(await req.json());
        return HttpResponse.json({ success: true, data: { message: 'ok' } });
      }),
    );
    renderLayout();

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(bodies).toEqual([{ refreshToken: 'r1' }]));
    expect(request).toHaveBeenCalledWith('admin-token-refresh', expect.any(Function));
    expect(insideLock).toBeNull();
  });

  it('shows that it is logging out while it waits', async () => {
    let releaseRefresh!: () => void;
    const refreshHeld = new Promise<void>((resolve) => (releaseRefresh = resolve));
    server.use(
      http.post('/api/auth/refresh', async () => {
        await refreshHeld;
        return HttpResponse.json({
          success: true,
          data: { accessToken: 'a2', refreshToken: 'r2' },
        });
      }),
      http.post(LOGOUT, () => HttpResponse.json({ success: true, data: { message: 'ok' } })),
    );
    renderLayout();
    const pending = getFreshAccessToken('a1').catch(() => undefined);

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    expect(screen.getByRole('button', { name: 'Logging out…' })).toBeDisabled();
    releaseRefresh();
    await pending;
    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });

  it('still logs out locally when the server call fails', async () => {
    server.use(http.post(LOGOUT, () => HttpResponse.json({ success: false }, { status: 500 })));
    renderLayout();

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });
});

describe('AdminLayout sidebar highlighting', () => {
  function renderAt(path: string) {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AdminLayout />}>
            <Route path="*" element={<p>Page body</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  const current = () =>
    screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.textContent);

  const heading = (name: string) => screen.getByRole('link', { name });

  it('lights only Ustaad verification on its page, not Ustaads', () => {
    renderAt('/artisans/verification');
    expect(current()).toEqual(['Ustaad verification']);
  });

  it('lights only All hire requests on its page, not Hire requests', () => {
    renderAt('/artisans/hire-requests/all');
    expect(current()).toEqual(['All hire requests']);
  });

  it('still lights Ustaads on the ustaad directory', () => {
    renderAt('/artisans');
    expect(current()).toEqual(['Ustaads']);
  });

  it('keeps the Approvals heading lit across its whole section', () => {
    renderAt('/artisans/hire-requests');
    expect(heading('Approvals').className).toMatch(/navLinkActive/);
  });

  it('keeps the Catalog heading lit across its whole section', () => {
    renderAt('/catalog/categories');
    expect(heading('Catalog').className).toMatch(/navLinkActive/);
  });

  it('does not light a section heading outside its section', () => {
    renderAt('/orders');
    expect(heading('Approvals').className).not.toMatch(/navLinkActive/);
    expect(heading('Catalog').className).not.toMatch(/navLinkActive/);
  });
});

describe('AdminLayout log out when storage fails', () => {
  it('still leaves for the login page', async () => {
    const realGet = Storage.prototype.getItem;
    // localStorage throwing (e.g. blocked storage) must not strand the admin.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
      if (key === 'admin_refresh_token') throw new Error('storage blocked');
      return realGet.call(this, key);
    });
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

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
