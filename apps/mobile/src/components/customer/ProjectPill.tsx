import { Pressable, StyleSheet } from 'react-native';

import { Colors, Radius, Spacing } from '../../theme';
import { Text } from '../ui';

interface ProjectPillProps {
  label: string;
  onPress?: () => void;
}

export function ProjectPill({ label, onPress }: ProjectPillProps) {
  return (
    <Pressable style={styles.pill} onPress={onPress}>
      <Text variant="bodyMedium" color={Colors.white}>
        🏠 {label}
      </Text>
      <Text variant="caption" color="rgba(255,255,255,0.7)">
        ▾
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: Radius.full,
    paddingVertical: Spacing.sm - 1,
    paddingHorizontal: Spacing.md,
  },
});
