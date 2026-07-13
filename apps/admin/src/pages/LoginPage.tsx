import { useState, type FormEvent, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Role } from '@golden-abode/types';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import { ROUTES } from '@/constants/routes';
import { useAdminLoginMutation } from '@/queries';
import { ApiClientError } from '@/services';
import { selectSetSession, useAuthStore } from '@/store';
import styles from '@/styles/shared.module.css';

export function AuthBrandPanel({ eyebrow, copy }: { eyebrow: string; copy: string }): ReactElement {
  return (
    <section className={styles.authBrandPanel}>
      <div className={styles.authBrandContent}>
        <p className={styles.authEyebrow}>{eyebrow}</p>
        <h1 className={styles.authBrandTitle}>Kailash Stones</h1>
        <p className={styles.authBrandCopy}>{copy}</p>
      </div>
      <div className={styles.authRidge} aria-hidden="true">
        <svg viewBox="0 0 300 140" preserveAspectRatio="none">
          <defs>
            <radialGradient id="authSunGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-sun)" />
              <stop offset="55%" stopColor="var(--color-tangerine)" />
              <stop offset="100%" stopColor="var(--color-tangerine)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="180" cy="40" r="38" fill="url(#authSunGlow)" />
          <polygon
            points="0,140 0,95 40,60 75,90 110,35 150,70 190,20 230,55 265,30 300,75 300,140"
            fill="var(--color-ridge)"
          />
          <polygon
            points="110,35 150,70 190,20 200,40 150,80 120,55"
            fill="var(--color-tangerine)"
            opacity="0.85"
          />
        </svg>
      </div>
    </section>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore(selectSetSession);
  const adminLoginMutation = useAdminLoginMutation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (): Promise<void> => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail.includes('@')) {
      setErrorMessage(ERROR_MESSAGES.invalidEmail);
      return;
    }

    if (password.length < APP_CONSTANTS.minPasswordLength) {
      setErrorMessage(ERROR_MESSAGES.invalidPassword);
      return;
    }

    try {
      const response = await adminLoginMutation.mutateAsync({
        email: trimmedEmail,
        password,
      });

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void handleLogin();
  };

  return (
    <div className={styles.authShell}>
      <AuthBrandPanel
        eyebrow="Operations console"
        copy="Materials for the home you're building — approve vendors and keep the marketplace moving."
      />

      <section className={styles.authFormPanel}>
        <div className={styles.authFormInner}>
          <p className={styles.authFormLabel}>Admin sign in</p>
          <h2 className={styles.authFormTitle}>Welcome back</h2>
          <p className={styles.authFormSubtitle}>Use your admin email and password to continue.</p>

          <form className={styles.authForm} onSubmit={handleSubmit}>
            <div className={styles.authField}>
              <label className={styles.authLabel} htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className={styles.authInput}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setErrorMessage(null);
                }}
                placeholder="admin@kailashstones.com"
              />
            </div>
            <div className={styles.authField}>
              <label className={styles.authLabel} htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className={styles.authInput}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrorMessage(null);
                }}
                placeholder="Enter your password"
              />
            </div>
            {errorMessage ? <p className={styles.authError}>{errorMessage}</p> : null}
            <button
              type="submit"
              className={styles.authSubmit}
              disabled={adminLoginMutation.isPending}
            >
              {adminLoginMutation.isPending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className={styles.authFooter}>
            Need an account?{' '}
            <Link className={styles.authFooterLink} to={ROUTES.register}>
              Register with secret key
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
