import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Badge, Card, Text } from '../../src/components/ui';
import { ROUTES } from '../../src/constants';
import { DEMO_PRODUCTS } from '../../src/data/demo-content';
import { Colors, Spacing } from '../../src/theme';

export default function ProductsTabScreen() {
  return (
    <DemoScreen
      title="Products"
      subtitle="Your catalogue, stock levels, and pricing"
      footer={
        <Pressable onPress={() => router.push(ROUTES.screens.addProduct)}>
          <Text variant="bodyMedium" color={Colors.sky} style={styles.addLink}>
            + Add product
          </Text>
        </Pressable>
      }
    >
      <View style={styles.list}>
        {DEMO_PRODUCTS.map((product) => (
          <Pressable
            key={product.name}
            onPress={() => router.push(ROUTES.screens.productDetail)}
          >
            <Card>
              <View style={styles.row}>
                <View style={styles.thumb} />
                <View style={styles.info}>
                  <Text variant="bodyMedium">{product.name}</Text>
                  <Text variant="caption" color={Colors.inkSoft}>
                    {product.category}
                  </Text>
                  <Text variant="numericSm" style={styles.price}>
                    {product.price}
                  </Text>
                </View>
                <Badge label={product.stock} variant="info" />
              </View>
            </Card>
          </Pressable>
        ))}
      </View>
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.sm + 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.skyTint,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  price: {
    marginTop: Spacing.xs,
  },
  addLink: {
    textAlign: 'center',
  },
});
