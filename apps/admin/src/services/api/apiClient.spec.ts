import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/server';
import { tokenStorage } from '@/services/storage/tokenStorage';

import { ApiClientError, getRequest, postRequest } from './apiClient';

const STATS = '/api/admin/stats';
const REFRESH = '/api/auth/refresh';
const LOGIN = '/api/auth/admin/login';

let refreshCalls = 0;
let refreshBodies: unknown[] = [];
let assignSpy: ReturnType<typeof vi.fn>;

function refreshAnswers(next: { accessToken: string; refreshToken: string } | 'fail') {
  server.use(
    http.post(REFRESH, async ({ request }) => {
      refreshCalls += 1;
      refreshBodies.push(await request.json());
      if (next === 'fail') {
        return HttpResponse.json(
          { success: false, message: 'Invalid refresh token' },
          { status: 401 },
        );
      }
      return HttpResponse.json({ success: true, data: next });
    }),
  );
}

// Answers 401 for every token except `goodToken`.
function statsAcceptOnly(goodToken: string, seen: string[] = []) {
  server.use(
    http.get(STATS, ({ request }) => {
      const auth = request.headers.get('Authorization') ?? '';
      seen.push(auth);
      if (auth === `Bearer ${goodToken}`) {
        return HttpResponse.json({ success: true, data: { totalUsers: 3 } });
      }
      return HttpResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }),
  );
}

beforeEach(() => {
  refreshCalls = 0;
  refreshBodies = [];
  tokenStorage.setTokens('a1', 'r1');
  assignSpy = vi.fn();
  vi.stubGlobal('location', { ...window.location, pathname: '/orders', assign: assignSpy });
});

afterEach(() => {
  vi.unstubAllGlobals();
  tokenStorage.clearTokens();
});

describe('apiClient token refresh', () => {
  it('retries a 401 once with the refreshed token', async () => {
    statsAcceptOnly('a2');
    refreshAnswers({ accessToken: 'a2', refreshToken: 'r2' });

    await expect(getRequest('/admin/stats')).resolves.toEqual({ totalUsers: 3 });

    expect(refreshCalls).toBe(1);
    expect(refreshBodies[0]).toEqual({ refreshToken: 'r1' });
    expect(tokenStorage.getAccessToken()).toBe('a2');
    expect(tokenStorage.getRefreshToken()).toBe('r2');
  });

  it('parallel 401s share one refresh call', async () => {
    statsAcceptOnly('a2');
    refreshAnswers({ accessToken: 'a2', refreshToken: 'r2' });

    const results = await Promise.all([
      getRequest('/admin/stats'),
      getRequest('/admin/stats'),
      getRequest('/admin/stats'),
    ]);

    expect(results).toEqual([{ totalUsers: 3 }, { totalUsers: 3 }, { totalUsers: 3 }]);
    expect(refreshCalls).toBe(1);
  });

  it('uses a token another tab already refreshed', async () => {
    const seen: string[] = [];
    server.use(
      http.get(STATS, ({ request }) => {
        const auth = request.headers.get('Authorization') ?? '';
        seen.push(auth);
        if (auth === 'Bearer a2') {
          return HttpResponse.json({ success: true, data: { totalUsers: 3 } });
        }
        // Another tab rotates the tokens while this request is in flight.
        tokenStorage.setTokens('a2', 'r2');
        return HttpResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
      }),
    );
    refreshAnswers({ accessToken: 'never', refreshToken: 'never' });

    await expect(getRequest('/admin/stats')).resolves.toEqual({ totalUsers: 3 });

    expect(refreshCalls).toBe(0);
    expect(seen).toEqual(['Bearer a1', 'Bearer a2']);
  });

  it('takes the cross-tab lock', async () => {
    const request = vi.fn((_name: string, callback: () => Promise<unknown>) => callback());
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    statsAcceptOnly('a2');
    refreshAnswers({ accessToken: 'a2', refreshToken: 'r2' });

    await getRequest('/admin/stats');

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe('admin-token-refresh');
  });

  it('refresh failure clears tokens and redirects to login', async () => {
    statsAcceptOnly('a2');
    refreshAnswers('fail');

    const error = await getRequest('/admin/stats').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).statusCode).toBe(401);
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(assignSpy).toHaveBeenCalledWith('/login');
  });

  it('does not retry a retried request', async () => {
    const seen: string[] = [];
    statsAcceptOnly('nobody', seen);
    refreshAnswers({ accessToken: 'a2', refreshToken: 'r2' });

    await expect(getRequest('/admin/stats')).rejects.toBeInstanceOf(ApiClientError);

    expect(refreshCalls).toBe(1);
    expect(seen).toEqual(['Bearer a1', 'Bearer a2']);
  });

  it('login 401 does not refresh', async () => {
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 }),
      ),
    );
    refreshAnswers({ accessToken: 'a2', refreshToken: 'r2' });

    const error = await postRequest('/auth/admin/login', { phone: 'x', password: 'y' }).catch(
      (caught: unknown) => caught,
    );

    expect((error as ApiClientError).message).toBe('Invalid credentials');
    expect(refreshCalls).toBe(0);
    expect(assignSpy).not.toHaveBeenCalled();
  });
});
