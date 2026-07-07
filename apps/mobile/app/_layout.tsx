import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAuthHydration } from '../src/hooks/auth';
import { RidgeSplash } from '../src/components/auth/RidgeSplash';
import { useFonts } from '../src/hooks/useFonts';
import { QueryProvider } from '../src/providers/QueryProvider';
import { Colors } from '../src/theme';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });

function RootNavigator() {
  const { fontsLoaded, fontError } = useFonts();
  const { isHydrated } = useAuthHydration();

  const isAppReady = (fontsLoaded || !!fontError) && isHydrated;

  useEffect(() => {
    if (isAppReady) {
      SplashScreen.hideAsync();
    }
  }, [isAppReady]);

  if (!isAppReady) {
    return <RidgeSplash />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryProvider>
        <RootNavigator />
      </QueryProvider>
    </SafeAreaProvider>
  );
}
