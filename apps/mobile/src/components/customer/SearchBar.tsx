import { StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '../../theme';
import { Text } from '../ui';

interface SearchBarProps {
  placeholder?: string;
}

export function SearchBar({ placeholder = 'Search tiles, pipes, paint…' }: SearchBarProps) {
  return (
    <View style={styles.bar}>
      <Text variant="body" color={Colors.inkSoft}>
        🔍 {placeholder}
      </Text>
    </View>
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
