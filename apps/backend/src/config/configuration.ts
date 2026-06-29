import { resolveDatabaseConfig, resolveRedisConfig } from './connection-url';

export default () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  database: resolveDatabaseConfig(),
  redis: resolveRedisConfig(),
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
