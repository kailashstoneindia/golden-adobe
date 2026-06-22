import { StyleSheet, View } from 'react-native';

import { Screen } from '../layout/Screen';
import { Text } from '../ui';
import { Colors, Spacing } from '../../theme';

interface TabPlaceholderProps {
  title: string;
  subtitle?: string;
}

export function TabPlaceholder({ title, subtitle }: TabPlaceholderProps) {
  return (
    <Screen edges={['top']}>
      <View style={styles.content}>
        <Text variant="h1">{title}</Text>
        {subtitle ? (
          <Text variant="caption" style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg + 2,
    paddingTop: Spacing.lg,
    backgroundColor: Colors.cream,
  },
  subtitle: {
    marginTop: Spacing.xs,
  },
});
