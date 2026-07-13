import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Role } from '@golden-abode/types';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import { ROUTES } from '@/constants/routes';
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

  return (
    <div className={styles.loginPage}>
      <div className={styles.loginCard}>
        <h1 className={styles.brand}>{APP_CONSTANTS.appName}</h1>
        <p className={styles.subtitle}>Create an admin account with the registration secret</p>

        <div className={styles.form}>
          <div>
            <label className={styles.label} htmlFor="name">
              Full name
            </label>
            <input
              id="name"
              className={styles.input}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setErrorMessage(null);
              }}
              placeholder="Super Admin"
              autoComplete="name"
            />
          </div>
          <div>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className={styles.input}
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
          <div>
            <label className={styles.label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className={styles.input}
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
          <div>
            <label className={styles.label} htmlFor="secretKey">
              Registration secret key
            </label>
            <input
              id="secretKey"
              className={styles.input}
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
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            disabled={adminRegisterMutation.isPending}
            onClick={handleRegister}
          >
            {adminRegisterMutation.isPending ? 'Creating account…' : 'Create admin account'}
          </button>
          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
          <p className={styles.subtitle}>
            Already registered? <Link to={ROUTES.login}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
