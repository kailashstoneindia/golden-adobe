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
  const response = await axios.post<ApiSuccessResponse<TokenPair>>(
    `${APP_CONSTANTS.apiBaseUrl}${API_ENDPOINTS.auth.refresh}`,
    { refreshToken },
    { headers: { 'Content-Type': 'application/json' } },
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
