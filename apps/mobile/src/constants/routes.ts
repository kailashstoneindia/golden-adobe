/** Expo Router paths — never hardcode route strings in screens. */
export const ROUTES = {
  entry: '/',
  auth: {
    login: '/(auth)/login',
    verifyOtp: '/(auth)/verify-otp',
    register: '/(auth)/register',
  },
  customer: {
    home: '/(customer)',
    browse: '/(customer)/browse',
    cart: '/(customer)/cart',
    orders: '/(customer)/orders',
    profile: '/(customer)/profile',
  },
  vendor: {
    home: '/(vendor)',
    products: '/(vendor)/products',
    orders: '/(vendor)/orders',
    shop: '/(vendor)/shop',
  },
  artisan: {
    projects: '/(artisan)',
    rewards: '/(artisan)/rewards',
    profile: '/(artisan)/profile',
  },
} as const;
