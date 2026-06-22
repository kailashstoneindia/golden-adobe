import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../hooks/auth';
import { Colors, FontFamily, Spacing } from '../../theme';
import { Text } from '../ui';
import { getTabsForRole } from './tab-config';

interface TabRoute {
  key: string;
  name: string;
}

interface BottomTabBarProps {
  state: {
    index: number;
    routes: TabRoute[];
  };
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
}

export function BottomTabBar({ state, navigation }: BottomTabBarProps) {
  const { user } = useAuth();
  const tabs = getTabsForRole(user?.role);

  return (
    <View style={styles.wrapper}>
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <View style={styles.bar}>
          {tabs.map((tab) => {
            const routeIndex = state.routes.findIndex(
              (route: TabRoute) => route.name === tab.routeName,
            );
            if (routeIndex === -1) {
              return null;
            }

            const isFocused = state.index === routeIndex;
            const color = isFocused ? Colors.tangerine : Colors.subtle;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: state.routes[routeIndex].key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(tab.routeName);
              }
            };

            return (
              <Pressable
                key={tab.routeName}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={onPress}
                style={styles.item}
              >
                <tab.Icon color={color} />
                <Text variant="caption" style={[styles.label, { color }]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  safeArea: {
    backgroundColor: Colors.white,
  },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: Spacing.sm + 2,
    paddingBottom: Spacing.xs + 2,
    paddingHorizontal: Spacing.xs + 2,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  label: {
    fontFamily: FontFamily.dmMono.regular,
    fontSize: 9.5,
    lineHeight: 12,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
});
