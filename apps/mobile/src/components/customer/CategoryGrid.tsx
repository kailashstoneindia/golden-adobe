import { StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '../../theme';
import { Text } from '../ui';

const CATEGORIES = [
  { name: 'Plumbing', emoji: '🔧' },
  { name: 'Electrical', emoji: '⚡', accent: true },
  { name: 'Stones & Tiles', emoji: '▦' },
  { name: 'Sanitaryware', emoji: '💧' },
  { name: 'Paints', emoji: '🎨' },
  { name: 'Hardware', emoji: '⚙️' },
] as const;

export function CategoryGrid() {
  return (
    <View style={styles.grid}>
      {CATEGORIES.map((cat) => (
        <View key={cat.name} style={styles.item}>
          <View style={[styles.circle, 'accent' in cat && cat.accent && styles.circleAccent]}>
            <Text variant="body">{cat.emoji}</Text>
          </View>
          <Text variant="caption" style={styles.label}>
            {cat.name}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
    justifyContent: 'space-between',
  },
  item: {
    width: '28%',
    alignItems: 'center',
    gap: Spacing.sm - 1,
  },
  circle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleAccent: {
    borderColor: Colors.tangerineTint,
  },
  label: {
    textAlign: 'center',
    fontSize: 10.5,
  },
});
