import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors, Radius, Spacing } from '../../theme';
import { Text } from '../ui';

export interface HorizontalCardItem {
  id: string;
  title: string;
  subtitle: string;
}

interface HorizontalCardListProps {
  items: HorizontalCardItem[];
}

export function HorizontalCardList({ items }: HorizontalCardListProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      {items.map((item) => (
        <View key={item.id} style={styles.card}>
          <LinearGradient
            colors={[Colors.skyTint, Colors.tangerineTint]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.image}
          />
          <Text variant="bodyMedium" style={styles.title}>
            {item.title}
          </Text>
          <Text variant="caption">{item.subtitle}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    gap: Spacing.md,
    paddingRight: Spacing.lg,
  },
  card: {
    width: 140,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
  },
  image: {
    height: 56,
    borderRadius: Radius.sm,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: 12.5,
  },
});
