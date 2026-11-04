import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '../../theme';
import type { AddressFormProps } from '../../types';
import { Button, Text, TextInput } from '../ui';

function AddressFormComponent({
  values,
  isSubmitting,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: AddressFormProps) {
  return (
    <View style={styles.form}>
      <TextInput
        label="Label"
        placeholder="Home"
        value={values.label}
        onChangeText={(value) => onChange('label', value)}
      />
      <TextInput
        label="Address line 1"
        placeholder="Flat, building"
        value={values.addressLine1}
        onChangeText={(value) => onChange('addressLine1', value)}
      />
      <TextInput
        label="Address line 2"
        placeholder="Area, landmark"
        value={values.addressLine2}
        onChangeText={(value) => onChange('addressLine2', value)}
      />
      <TextInput
        label="City"
        placeholder="Delhi"
        value={values.city}
        onChangeText={(value) => onChange('city', value)}
      />
      <TextInput
        label="Pincode"
        placeholder="110001"
        value={values.pincode}
        onChangeText={(value) => onChange('pincode', value)}
        keyboardType="number-pad"
        maxLength={6}
      />
      <Pressable
        onPress={() => onChange('isDefault', !values.isDefault)}
        style={styles.defaultRow}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: values.isDefault }}
        hitSlop={4}
      >
        <View style={[styles.checkbox, values.isDefault ? styles.checkboxChecked : null]}>
          {values.isDefault ? (
            <Text variant="caption" color={Colors.white}>
              ✓
            </Text>
          ) : null}
        </View>
        <Text variant="body">Use as my default address</Text>
      </Pressable>
      <View style={styles.actions}>
        <Button title="Cancel" variant="secondary" onPress={onCancel} />
        <Button title={submitLabel} disabled={isSubmitting} onPress={onSubmit} />
      </View>
    </View>
  );
}

export const AddressForm = memo(AddressFormComponent);

const styles = StyleSheet.create({
  form: {
    gap: Spacing.md,
  },
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.line,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: Colors.navy,
    backgroundColor: Colors.navy,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    borderColor: Colors.line,
  },
});
