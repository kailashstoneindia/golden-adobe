/** Expo Router paths — never hardcode route strings in screens. */
export const ROUTES = {
  entry: '/',
  home: '/(tabs)',
  pendingApproval: '/pending-approval',
  vendorOnboard: '/vendor-onboard',
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
  screens: {
    myProjects: '/(screens)/my-projects',
    orderHistory: '/(screens)/order-history',
    savedAddresses: '/(screens)/saved-addresses',
    helpSupport: '/(screens)/help-support',
    checkout: '/(screens)/checkout',
    orderDetail: '/(screens)/order-detail',
    productDetail: '/(screens)/product-detail',
    addProduct: '/(screens)/add-product',
  },
} as const;
