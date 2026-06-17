export default () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'golden_abode',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    onboardingSecret: process.env.JWT_ONBOARDING_SECRET,
    onboardingExpiresIn: process.env.JWT_ONBOARDING_EXPIRES_IN || '15m',
    refreshTokenTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10),
  },
  msg91: {
    authKey: process.env.MSG91_AUTH_KEY,
    templateId: process.env.MSG91_TEMPLATE_ID,
    senderId: process.env.MSG91_SENDER_ID || 'GOLDEN',
  },
  throttle: {
    otpSendLimit: parseInt(process.env.THROTTLE_OTP_SEND_LIMIT || '3', 10),
    otpSendTtl: parseInt(process.env.THROTTLE_OTP_SEND_TTL || '3600', 10),
    otpVerifyLimit: parseInt(process.env.THROTTLE_OTP_VERIFY_LIMIT || '5', 10),
    otpVerifyTtl: parseInt(process.env.THROTTLE_OTP_VERIFY_TTL || '600', 10),
  },
});
