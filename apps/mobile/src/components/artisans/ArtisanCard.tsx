import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TRADE_TYPE_LABELS } from '../../constants';
import { Colors, Spacing } from '../../theme';
import type { ArtisanCardProps } from '../../types';
import { Badge, Card, Text } from '../ui';

function ArtisanCardComponent({ artisan, onPress }: ArtisanCardProps) {
  const handlePress = useCallback(() => onPress(artisan.id), [artisan.id, onPress]);

  return (
    <Pressable onPress={handlePress}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text variant="bodyMedium">{TRADE_TYPE_LABELS[artisan.tradeType]}</Text>
          <Badge
            label={artisan.isAvailable ? 'Available' : 'Fully booked'}
            variant={artisan.isAvailable ? 'success' : 'pending'}
          />
        </View>
        {artisan.experienceYears != null ? (
          <Text variant="caption" color={Colors.inkSoft}>
            {artisan.experienceYears} year{artisan.experienceYears === 1 ? '' : 's'} of experience
          </Text>
        ) : null}
        {artisan.bio ? (
          <Text variant="body" color={Colors.inkSoft} numberOfLines={2}>
            {artisan.bio}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

export const ArtisanCard = memo(ArtisanCardComponent);

const styles = StyleSheet.create({
  card: {
    gap: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
