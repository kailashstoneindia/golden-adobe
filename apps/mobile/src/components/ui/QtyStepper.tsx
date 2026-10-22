import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '../../theme';
import type { QtyStepperProps } from '../../types';
import { Text } from './Text';

function QtyStepperComponent({
  quantity,
  isDisabled = false,
  onIncrease,
  onDecrease,
}: QtyStepperProps) {
  const handleDecrease = useCallback(() => {
    if (!isDisabled) {
      onDecrease();
    }
  }, [isDisabled, onDecrease]);

  const handleIncrease = useCallback(() => {
    if (!isDisabled) {
      onIncrease();
    }
  }, [isDisabled, onIncrease]);

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        disabled={isDisabled}
        onPress={handleDecrease}
        style={styles.button}
      >
        <Text variant="bodyMedium">−</Text>
      </Pressable>
      <Text variant="numericSm">{quantity}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={isDisabled}
        onPress={handleIncrease}
        style={styles.button}
      >
        <Text variant="bodyMedium">+</Text>
      </Pressable>
    </View>
  );
}

export const QtyStepper = memo(QtyStepperComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
});
