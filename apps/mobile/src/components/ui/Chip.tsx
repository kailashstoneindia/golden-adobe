import { Pressable, StyleSheet } from 'react-native';

import { Colors, Radius, Spacing } from '../../theme';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  disabled?: boolean;
}

/** Selectable pill for single-choice option rows (trade, bank, linked job). */
export function Chip({ label, isSelected, onPress, disabled }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, isSelected ? styles.chipSelected : null]}
    >
      <Text variant="caption" color={isSelected ? Colors.navy : Colors.inkSoft}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.full,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.white,
  },
  chipSelected: {
    borderColor: Colors.navy,
    backgroundColor: Colors.skyTint,
  },
});
