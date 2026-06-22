import { Redirect, Stack } from 'expo-router';

import { ROUTES } from '../../src/constants';
import { useAuth } from '../../src/hooks/auth';

export default function AuthLayout() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Redirect href={ROUTES.home} />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
