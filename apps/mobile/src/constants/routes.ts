/** Expo Router paths — never hardcode route strings in screens. */
export const ROUTES = {
  entry: '/',
  home: '/home',
  auth: {
    login: '/(auth)/login',
    verifyOtp: '/(auth)/verify-otp',
    register: '/(auth)/register',
  },
} as const;
