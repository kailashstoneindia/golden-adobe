import { StyleSheet, View } from 'react-native';

import { PRICE_SUMMARY_LABELS } from '../../constants';
import { Colors, Spacing } from '../../theme';
import type { PriceSummaryProps, PriceSummaryRowProps } from '../../types';
import { formatInr, formatInrWithPaise } from '../../utils';
import { Text } from '../ui';

export function PriceSummary({ summary }: PriceSummaryProps) {
  return (
    <View style={styles.wrap}>
      <AdjustmentRows summary={summary} />
      <View style={styles.divider} />
      <PriceSummaryRow
        label={PRICE_SUMMARY_LABELS.total}
        value={formatInr(summary.total)}
        isEmphasized
      />
    </View>
  );
}

function AdjustmentRows({ summary }: PriceSummaryProps) {
  return (
    <>
      <PriceSummaryRow label={PRICE_SUMMARY_LABELS.subtotal} value={formatInr(summary.subtotal)} />
      <PriceSummaryRow label={PRICE_SUMMARY_LABELS.tax} value={formatInrWithPaise(summary.tax)} />
      <PriceSummaryRow
        label={PRICE_SUMMARY_LABELS.discount}
        value={discountDisplayValue(summary.discount, summary.isDiscountApplied)}
      />
    </>
  );
}

function discountDisplayValue(discount: number, isDiscountApplied: boolean): string {
  if (!isDiscountApplied) {
    return PRICE_SUMMARY_LABELS.notApplied;
  }
  return formatInr(discount);
}

function PriceSummaryRow({ label, value, isEmphasized = false }: PriceSummaryRowProps) {
  const labelColor = isEmphasized ? Colors.ink : Colors.inkSoft;
  const valueVariant = isEmphasized ? 'bodyMedium' : 'numericSm';

  return (
    <View style={styles.row}>
      <Text variant={isEmphasized ? 'bodyMedium' : 'caption'} color={labelColor}>
        {label}
      </Text>
      <Text variant={valueVariant} color={isEmphasized ? Colors.ink : Colors.inkSoft}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Spacing.xxl,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.line,
    marginVertical: Spacing.xs,
  },
});
