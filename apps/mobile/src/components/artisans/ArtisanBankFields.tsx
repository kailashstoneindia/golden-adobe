import { StyleSheet, View } from 'react-native';

import indianBanks from '../../data/indian-banks.json';
import { Colors, Spacing } from '../../theme';
import type { ArtisanBankFieldsProps } from '../../types';
import { Chip, Text, TextInput } from '../ui';

export function ArtisanBankFields({ values, onChange }: ArtisanBankFieldsProps) {
  return (
    <>
      <TextInput
        label="Account holder name"
        placeholder="Ramesh Kumar"
        value={values.accountHolderName}
        onChangeText={(value) => onChange('accountHolderName', value)}
        autoCapitalize="words"
      />
      <View style={styles.group}>
        <Text variant="caption" color={Colors.inkSoft}>
          Bank name
        </Text>
        <View style={styles.chips}>
          {indianBanks.map((bankName) => (
            <Chip
              key={bankName}
              label={bankName}
              isSelected={values.bankName === bankName}
              onPress={() => onChange('bankName', bankName)}
            />
          ))}
        </View>
      </View>
      <TextInput
        label="Account number"
        placeholder="123456789012"
        value={values.accountNumber}
        onChangeText={(value) => onChange('accountNumber', value)}
        keyboardType="number-pad"
      />
      <TextInput
        label="IFSC code"
        placeholder="HDFC0000123"
        value={values.ifscCode}
        onChangeText={(value) => onChange('ifscCode', value.toUpperCase())}
        autoCapitalize="characters"
        maxLength={11}
      />
      <TextInput
        label="Branch name"
        placeholder="Vaishali Nagar"
        value={values.branchName}
        onChangeText={(value) => onChange('branchName', value)}
        autoCapitalize="words"
      />
    </>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
});
