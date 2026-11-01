import { StyleSheet, View } from 'react-native';

import { ARTISAN_CONSTANTS } from '../../constants';
import { Colors, Spacing } from '../../theme';
import type { ArtisanProfileFieldsProps } from '../../types';
import { sanitizePincodeDigits } from '../../utils';
import { Text, TextInput } from '../ui';
import { TradeTypeChips } from './TradeTypeChips';

export function ArtisanProfileFields({ values, onChange }: ArtisanProfileFieldsProps) {
  return (
    <>
      <View style={styles.group}>
        <Text variant="caption" color={Colors.inkSoft}>
          Your trade
        </Text>
        <TradeTypeChips
          selected={values.tradeType}
          onSelect={(tradeType) => onChange('tradeType', tradeType)}
        />
      </View>
      <TextInput
        label="Service area pincode"
        placeholder="302021"
        value={values.servicePincode}
        onChangeText={(value) => onChange('servicePincode', sanitizePincodeDigits(value))}
        keyboardType="number-pad"
        maxLength={6}
      />
      <TextInput
        label="Years of experience (optional)"
        placeholder="5"
        value={values.experienceYears}
        onChangeText={(value) => onChange('experienceYears', value.replace(/\D/g, ''))}
        keyboardType="number-pad"
        maxLength={2}
      />
      <TextInput
        label="Short bio (optional)"
        placeholder="Plumber with 6 years of residential work in Jaipur"
        value={values.bio}
        onChangeText={(value) => onChange('bio', value)}
        maxLength={ARTISAN_CONSTANTS.bioMaxLength}
        multiline
      />
    </>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.xs,
  },
});
