export type RazorpayCheckoutOptions = {
  razorpayOrderId: string;
  merchantName: string;
  amountPaise: number;
  // Seconds until the sheet closes itself (Razorpay Checkout `timeout`).
  timeoutSeconds: number;
};

export type RazorpayCheckoutResult = {
  razorpayPaymentId: string | null;
};
