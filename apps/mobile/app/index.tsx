import { useEffect, useState } from 'react';
import { router } from 'expo-router';

import { RidgeSplash } from '../src/components/auth/RidgeSplash';
import { ROUTES } from '../src/constants';
import { useAuth } from '../src/hooks/auth';
import { resolveAuthenticatedRoute } from '../src/utils/user';

const SPLASH_DURATION_MS = 1400;

export default function EntryScreen() {
  const { isAuthenticated, isHydrated, user } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isHydrated || showSplash) return;

    router.replace(isAuthenticated ? resolveAuthenticatedRoute(user) : ROUTES.auth.login);
  }, [isAuthenticated, isHydrated, showSplash, user]);

  if (showSplash || !isHydrated) {
    return <RidgeSplash />;
  }

  return null;
}
