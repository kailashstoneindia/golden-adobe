import { Redirect, Tabs } from 'expo-router';

import { BottomTabBar } from '../../src/components/navigation/BottomTabBar';
import { ROUTES } from '../../src/constants';
import { useArtisanOnboardingStatus } from '../../src/hooks/artisans';
import { useAuth, useMe } from '../../src/hooks/auth';
import { Colors } from '../../src/theme';
import { isPendingApproval, needsVendorOnboarding } from '../../src/utils/user';

export default function TabsLayout() {
  const { isAuthenticated, isHydrated, user } = useAuth();

  const artisanOnboarding = useArtisanOnboardingStatus(user);

  useMe();

  if (!isHydrated || artisanOnboarding.isChecking) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href={ROUTES.auth.login} />;
  }

  if (user && needsVendorOnboarding(user)) {
    return <Redirect href={ROUTES.vendorOnboard} />;
  }

  if (artisanOnboarding.needsOnboarding) {
    return <Redirect href={ROUTES.artisanOnboard} />;
  }

  if (user && isPendingApproval(user)) {
    return <Redirect href={ROUTES.pendingApproval} />;
  }

  return (
    <Tabs
      tabBar={(props) => (
        <BottomTabBar state={props.state} navigation={props.navigation as never} />
      )}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: Colors.cream },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="browse" options={{ href: null }} />
      <Tabs.Screen name="cart" options={{ href: null }} />
      <Tabs.Screen name="orders" options={{ href: null }} />
      <Tabs.Screen name="you" options={{ href: null }} />
      <Tabs.Screen name="products" options={{ href: null }} />
      <Tabs.Screen name="shop" options={{ href: null }} />
    </Tabs>
  );
}
