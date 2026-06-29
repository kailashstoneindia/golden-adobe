import { Redirect, Stack } from 'expo-router';

import { ROUTES } from '../../src/constants';
import { useAuth } from '../../src/hooks/auth';
import { resolveAuthenticatedRoute } from '../../src/utils/user';

export default function AuthLayout() {
  const { isAuthenticated, user } = useAuth();

  if (isAuthenticated) {
    return <Redirect href={resolveAuthenticatedRoute(user)} />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
