import { Redirect, Tabs } from 'expo-router';

import { BottomTabBar } from '../../src/components/navigation/BottomTabBar';
import { ROUTES } from '../../src/constants';
import { useAuth } from '../../src/hooks/auth';
import { Colors } from '../../src/theme';

export default function TabsLayout() {
  const { isAuthenticated, isHydrated } = useAuth();

  if (!isHydrated) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href={ROUTES.auth.login} />;
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
