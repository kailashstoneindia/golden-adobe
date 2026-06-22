const DEFAULT_DEV_API_URL = 'http://192.168.1.6:3000/api';
const DEFAULT_PROD_API_URL = 'https://api.goldenabode.in/api';

/**
 * Runtime environment values.
 * Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` (see `.env.example`).
 */
export const Env = {
  apiBaseUrl:
    process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? DEFAULT_DEV_API_URL : DEFAULT_PROD_API_URL),
  isDev: __DEV__,
} as const;
