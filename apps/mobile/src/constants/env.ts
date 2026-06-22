import { Platform } from 'react-native';

const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const DEFAULT_DEV_API_URL = `http://${DEV_HOST}:3000/api`;
const DEFAULT_PROD_API_URL = 'https://api.goldenabode.in/api';

/**
 * Runtime environment values.
 * Override the API URL via `EXPO_PUBLIC_API_URL` in `.env` or EAS secrets.
 */
export const Env = {
  apiBaseUrl:
    process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? DEFAULT_DEV_API_URL : DEFAULT_PROD_API_URL),
  isDev: __DEV__,
} as const;
