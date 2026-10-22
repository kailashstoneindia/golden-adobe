export type RazorpayCheckoutOptions = {
  razorpayOrderId: string;
  merchantName: string;
  amountPaise: number;
};

export type RazorpayCheckoutResult = {
  razorpayPaymentId: string | null;
};
