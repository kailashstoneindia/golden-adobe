/** Expo Router paths — never hardcode route strings in screens. */
export const ROUTES = {
  entry: '/',
  home: '/(tabs)',
  tabs: {
    home: '/(tabs)',
    browse: '/(tabs)/browse',
    cart: '/(tabs)/cart',
    orders: '/(tabs)/orders',
    you: '/(tabs)/you',
    products: '/(tabs)/products',
    shop: '/(tabs)/shop',
  },
  auth: {
    login: '/(auth)/login',
    verifyOtp: '/(auth)/verify-otp',
    register: '/(auth)/register',
  },
} as const;
