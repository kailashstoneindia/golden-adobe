export const OTP_TTL_SECONDS = 300; // 5 minutes

export const getOtpKey = (phone: string) => `otp:${phone}`;
