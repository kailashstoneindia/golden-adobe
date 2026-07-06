import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Role } from '@golden-abode/types';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import { ROUTES } from '@/constants/routes';
import { useSendOtpMutation, useVerifyOtpMutation } from '@/queries';
import { ApiClientError, isAuthResponse } from '@/services';
import { selectSetSession, useAuthStore } from '@/store';
import type { LoginStep } from '@/types';
import styles from '@/styles/shared.module.css';
import { isValidIndianMobile, sanitizePhoneDigits, toE164 } from '@/utils/phone';

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore(selectSetSession);

  const [loginStep, setLoginStep] = useState<LoginStep>('phone');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sendOtpMutation = useSendOtpMutation();
  const verifyOtpMutation = useVerifyOtpMutation();

  const handlePhoneChange = (value: string) => {
    setPhoneDigits(sanitizePhoneDigits(value));
    setErrorMessage(null);
  };

  const handleSendOtp = async () => {
    if (!isValidIndianMobile(phoneDigits)) {
      setErrorMessage(ERROR_MESSAGES.invalidPhone);
      return;
    }

    try {
      const result = await sendOtpMutation.mutateAsync(toE164(phoneDigits));
      setDevOtp(result.devOtp ?? null);
      if (result.devOtp) {
        setOtp(result.devOtp);
      }
      setLoginStep('otp');
    } catch (error) {
      setErrorMessage(error instanceof ApiClientError ? error.message : ERROR_MESSAGES.generic);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== APP_CONSTANTS.otpLength) {
      setErrorMessage(ERROR_MESSAGES.invalidOtp);
      return;
    }

    try {
      const response = await verifyOtpMutation.mutateAsync({
        phone: toE164(phoneDigits),
        otp,
      });

      if (!isAuthResponse(response)) {
        setErrorMessage(ERROR_MESSAGES.newUserBlocked);
        return;
      }

      if (response.user.role !== Role.ADMIN) {
        setErrorMessage(ERROR_MESSAGES.adminOnly);
        return;
      }

      setSession(response.user, response.accessToken, response.refreshToken);
      navigate(ROUTES.dashboard);
    } catch (error) {
      setErrorMessage(error instanceof ApiClientError ? error.message : ERROR_MESSAGES.generic);
    }
  };

  return (
    <div className={styles.loginPage}>
      <div className={styles.loginCard}>
        <h1 className={styles.brand}>{APP_CONSTANTS.appName}</h1>
        <p className={styles.subtitle}>Sign in with your admin mobile number</p>

        <div className={styles.form}>
          {loginStep === 'phone' ? (
            <>
              <label className={styles.label} htmlFor="phone">
                Mobile number
              </label>
              <div className={styles.phoneRow}>
                <div className={styles.prefix}>{APP_CONSTANTS.phoneCountryCode}</div>
                <input
                  id="phone"
                  className={styles.input}
                  value={phoneDigits}
                  onChange={(event) => handlePhoneChange(event.target.value)}
                  placeholder="99999 99999"
                  inputMode="numeric"
                />
              </div>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                disabled={sendOtpMutation.isPending}
                onClick={handleSendOtp}
              >
                Send OTP
              </button>
            </>
          ) : (
            <>
              <label className={styles.label} htmlFor="otp">
                Enter OTP
              </label>
              <input
                id="otp"
                className={styles.input}
                value={otp}
                onChange={(event) => setOtp(sanitizePhoneDigits(event.target.value).slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
              />
              {devOtp ? <p className={styles.hint}>Demo code: {devOtp}</p> : null}
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                disabled={verifyOtpMutation.isPending}
                onClick={handleVerifyOtp}
              >
                Verify & continue
              </button>
            </>
          )}
          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
        </div>
      </div>
    </div>
  );
}
