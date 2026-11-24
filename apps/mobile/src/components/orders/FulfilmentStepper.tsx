import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  CUSTOMER_GROUP_STATUS_LABELS,
  VENDOR_GROUP_STATUS_LABELS,
  VENDOR_GROUP_STATUS_STEPS,
} from '../../constants';
import { Colors, Spacing } from '../../theme';
import type { FulfilmentStepperProps } from '../../types';
import { Text } from '../ui';
import { ORDER_VENDOR_GROUP_STATUSES } from '@golden-abode/types';

function FulfilmentStepperComponent({ status, audience = 'other' }: FulfilmentStepperProps) {
  const labels =
    audience === 'customer' ? CUSTOMER_GROUP_STATUS_LABELS : VENDOR_GROUP_STATUS_LABELS;
  if (
    status === ORDER_VENDOR_GROUP_STATUSES.CANCELLED ||
    status === ORDER_VENDOR_GROUP_STATUSES.DELIVERY_FAILED
  ) {
    return (
      <Text variant="caption" color={Colors.brick}>
        {labels[status]}
      </Text>
    );
  }

  const currentIndex = VENDOR_GROUP_STATUS_STEPS.indexOf(status);

  return (
    <View style={styles.row}>
      {VENDOR_GROUP_STATUS_STEPS.map((step, stepIndex) => (
        <Text
          key={step}
          variant="caption"
          color={stepIndex <= currentIndex ? Colors.navy : Colors.subtle}
        >
          {stepIndex > 0 ? ' → ' : ''}
          {step === ORDER_VENDOR_GROUP_STATUSES.PENDING && audience === 'customer'
            ? 'Placed'
            : labels[step]}
        </Text>
      ))}
    </View>
  );
}

export const FulfilmentStepper = memo(FulfilmentStepperComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.xs,
  },
});
