import { StyleSheet, View } from 'react-native';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Button, Text, TextInput } from '../../src/components/ui';
import { Colors, Spacing } from '../../src/theme';

export default function AddProductScreen() {
  return (
    <DemoScreen
      title="Add product"
      subtitle="Quick catalogue entry for your shop"
      showBack
      footer={<Button title="Save product" fullWidth onPress={() => {}} />}
    >
      <View style={styles.upload}>
        <Text variant="caption" color={Colors.subtle}>
          + Upload photo
        </Text>
      </View>

      <TextInput label="Title" placeholder="Kota Stone — Natural Beige" />
      <TextInput label="Category" placeholder="Stones & Tiles" />
      <View style={styles.row}>
        <View style={styles.half}>
          <TextInput label="Price / unit" placeholder="₹68" />
        </View>
        <View style={styles.half}>
          <TextInput label="Unit type" placeholder="sq ft" />
        </View>
      </View>
      <TextInput label="Stock quantity" placeholder="800" keyboardType="numeric" />
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  upload: {
    height: 90,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.line,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm + 2,
  },
  half: {
    flex: 1,
  },
});
