import { Pressable, StyleSheet, View } from 'react-native';
import { Role } from '@golden-abode/types';

import { Colors, Radius, Spacing } from '../../theme';
import { Text } from '../ui';

type RegisterableRole = Exclude<Role, Role.ADMIN>;

export interface RoleOption {
  role: RegisterableRole;
  title: string;
  description: string;
}

interface RoleCardProps {
  option: RoleOption;
  selected: boolean;
  onSelect: (role: RegisterableRole) => void;
}

export function RoleCard({ option, selected, onSelect }: RoleCardProps) {
  return (
    <Pressable
      onPress={() => onSelect(option.role)}
      style={[styles.card, selected && styles.cardSelected]}
    >
      <View style={styles.radio}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <View style={styles.text}>
        <Text variant="bodyMedium">{option.title}</Text>
        <Text variant="caption" style={styles.description}>
          {option.description}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.line,
    backgroundColor: Colors.white,
  },
  cardSelected: {
    borderColor: Colors.tangerine,
    backgroundColor: Colors.tangerineTint,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.tangerine,
  },
  text: {
    flex: 1,
  },
  description: {
    marginTop: Spacing.xs,
  },
});
