import { TRADE_TYPES } from '@golden-abode/types';
import { StyleSheet, View } from 'react-native';

import { TRADE_TYPE_LABELS } from '../../constants';
import { Spacing } from '../../theme';
import type { TradeTypeChipsProps } from '../../types';
import { Chip } from '../ui';

export function TradeTypeChips({ selected, onSelect }: TradeTypeChipsProps) {
  return (
    <View style={styles.wrap}>
      {TRADE_TYPES.map((tradeType) => (
        <Chip
          key={tradeType}
          label={TRADE_TYPE_LABELS[tradeType]}
          isSelected={selected === tradeType}
          onPress={() => onSelect(tradeType)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
});
