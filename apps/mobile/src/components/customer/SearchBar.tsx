import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '../../theme';
import { Text } from '../ui';

interface SearchBarProps {
  placeholder?: string;
  onPress?: () => void;
}

export function SearchBar({ placeholder = 'Search tiles, pipes, paint…', onPress }: SearchBarProps) {
  return (
    <Pressable style={styles.bar} onPress={onPress}>
      <Text variant="body" color={Colors.inkSoft}>
        🔍 {placeholder}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md - 1,
    paddingHorizontal: Spacing.md + 2,
  },
});
