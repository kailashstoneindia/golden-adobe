import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Role } from '@golden-abode/types';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import { ROUTES } from '@/constants/routes';
import { AuthBrandPanel } from '@/pages/LoginPage';
import { useAdminRegisterMutation } from '@/queries';
import { ApiClientError } from '@/services';
import { selectSetSession, useAuthStore } from '@/store';
import styles from '@/styles/shared.module.css';

export function RegisterPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore(selectSetSession);
  const adminRegisterMutation = useAdminRegisterMutation();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRegister = async (): Promise<void> => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedSecretKey = secretKey.trim();

    if (trimmedName.length < 2) {
      setErrorMessage(ERROR_MESSAGES.invalidName);
      return;
    }

    if (!trimmedEmail.includes('@')) {
      setErrorMessage(ERROR_MESSAGES.invalidEmail);
      return;
    }

    if (password.length < APP_CONSTANTS.minPasswordLength) {
      setErrorMessage(ERROR_MESSAGES.invalidPassword);
      return;
    }

    if (trimmedSecretKey.length < APP_CONSTANTS.minSecretKeyLength) {
      setErrorMessage(ERROR_MESSAGES.invalidSecretKey);
      return;
    }

    try {
      const response = await adminRegisterMutation.mutateAsync({
        name: trimmedName,
        email: trimmedEmail,
        password,
        secretKey: trimmedSecretKey,
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
    void handleRegister();
  };

  return (
    <div className={styles.authShell}>
      <AuthBrandPanel
        eyebrow="Secure onboarding"
        copy="Materials for the home you're building — create an admin account with the registration secret."
      />

      <section className={styles.authFormPanel}>
        <div className={styles.authFormInner}>
          <p className={styles.authFormLabel}>Admin registration</p>
          <h2 className={styles.authFormTitle}>Create your account</h2>
          <p className={styles.authFormSubtitle}>
            Email, password, and the registration secret are required.
          </p>

          <form className={styles.authForm} onSubmit={handleSubmit}>
            <div className={styles.authField}>
              <label className={styles.authLabel} htmlFor="name">
                Full name
              </label>
              <input
                id="name"
                className={styles.authInput}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setErrorMessage(null);
                }}
                placeholder="Super Admin"
                autoComplete="name"
              />
            </div>
            <div className={styles.authField}>
              <label className={styles.authLabel} htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className={styles.authInput}
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setErrorMessage(null);
                }}
                placeholder="admin@kailashstones.com"
                autoComplete="email"
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
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrorMessage(null);
                }}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
            <div className={styles.authField}>
              <label className={styles.authLabel} htmlFor="secretKey">
                Registration secret key
              </label>
              <input
                id="secretKey"
                className={styles.authInput}
                type="password"
                value={secretKey}
                onChange={(event) => {
                  setSecretKey(event.target.value);
                  setErrorMessage(null);
                }}
                placeholder="Provided by the platform owner"
                autoComplete="off"
              />
            </div>
            {errorMessage ? <p className={styles.authError}>{errorMessage}</p> : null}
            <button
              type="submit"
              className={styles.authSubmit}
              disabled={adminRegisterMutation.isPending}
            >
              {adminRegisterMutation.isPending ? 'Creating account…' : 'Create admin account'}
            </button>
          </form>

          <p className={styles.authFooter}>
            Already registered?{' '}
            <Link className={styles.authFooterLink} to={ROUTES.login}>
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
