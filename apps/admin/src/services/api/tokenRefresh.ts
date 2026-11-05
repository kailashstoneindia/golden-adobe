import axios from 'axios';
import type { ApiSuccessResponse } from '@golden-abode/types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import { APP_CONSTANTS } from '@/constants/appConstants';
import { tokenStorage } from '@/services/storage/tokenStorage';

// Refresh tokens rotate and the backend treats a reused one as theft: it
// revokes every session (auth.service.ts, refresh()). So two refreshes with the
// same token — two parallel requests in one tab, or two admin tabs — would log
// the admin out everywhere. One refresh at a time per tab (inFlight), and one
// at a time across tabs (Web Lock). A tab that waited on the lock finds the
// token another tab already stored and uses it instead of refreshing again.

const LOCK_NAME = 'admin-token-refresh';
const REFRESH_TIMEOUT_MS = 15_000;

type TokenPair = { accessToken: string; refreshToken: string };

let inFlight: Promise<string> | null = null;

async function refreshUnderLock(staleAccessToken: string | null): Promise<string> {
  const stored = tokenStorage.getAccessToken();
  if (stored && stored !== staleAccessToken) {
    return stored;
  }

  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token stored');
  }

  // Bare axios, not apiClient: a 401 here must not re-enter the interceptor.
  // baseURL lets axios join the paths (a trailing slash in VITE_API_BASE_URL is
  // fine). The timeout matters because this runs while holding the cross-tab
  // lock: a stalled request would freeze every admin tab.
  const response = await axios.post<ApiSuccessResponse<TokenPair>>(
    API_ENDPOINTS.auth.refresh,
    { refreshToken },
    {
      baseURL: APP_CONSTANTS.apiBaseUrl,
      timeout: REFRESH_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' },
    },
  );
  const { accessToken, refreshToken: nextRefreshToken } = response.data.data;
  tokenStorage.setTokens(accessToken, nextRefreshToken);
  return accessToken;
}

async function runExclusive(staleAccessToken: string | null): Promise<string> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) {
    return refreshUnderLock(staleAccessToken);
  }
  // The lock is held until the callback's promise settles; await unwraps it.
  return await locks.request(LOCK_NAME, () => refreshUnderLock(staleAccessToken));
}

/**
 * Waits until no refresh is running in this tab or any other, then removes the
 * stored tokens and returns the refresh token to revoke. Log out uses this so
 * it revokes the token that is current, not one a refresh is about to rotate
 * (revoking that one would look like reuse and end every session).
 */
export async function takeRefreshTokenForLogout(): Promise<string | null> {
  if (inFlight) {
    await inFlight.catch(() => undefined);
  }
  // Read and clear under the same lock refreshes use, so a tab queued behind
  // us finds no refresh token instead of refreshing with the one we revoke.
  const take = () => {
    const refreshToken = tokenStorage.getRefreshToken();
    tokenStorage.clearTokens();
    return refreshToken;
  };
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? await locks.request(LOCK_NAME, take) : take();
}

/**
 * Returns an access token newer than `staleAccessToken`, refreshing only if no
 * other caller (this tab or another) already has.
 */
export function getFreshAccessToken(staleAccessToken: string | null): Promise<string> {
  if (!inFlight) {
    inFlight = runExclusive(staleAccessToken).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
