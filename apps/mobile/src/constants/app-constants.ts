export const APP_CONSTANTS = {
  otpLength: 6,
  otpResendCooldownSeconds: 30,
  searchDefaultPageSize: 20,
  vendorListingsDefaultPageSize: 25,
  indianPincodeLength: 6,
  defaultCartQuantity: 1,
  cartStaleTimeMs: 15_000,
  ordersStaleTimeMs: 15_000,
  addressesStaleTimeMs: 60_000,
  vendorProfileStaleTimeMs: 60_000,
  orderPaymentPollIntervalMs: 2_000,
  orderPaymentPollMaxAttempts: 30,
  checkoutMerchantName: 'Kailash Stones',
  // The Checkout sheet closes this long before the order's payment hold runs
  // out, and is not opened at all with less than the minimum left (decision 0054).
  paymentSheetCloseBufferSeconds: 60,
  paymentSheetMinSeconds: 60,
  unsetTaxAmount: 0,
  unsetDiscountAmount: 0,
} as const;
