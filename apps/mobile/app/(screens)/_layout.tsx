import { Stack } from 'expo-router';

import { Colors } from '../../src/theme';

export default function ScreensLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.cream },
        animation: 'slide_from_right',
      }}
    />
  );
}
