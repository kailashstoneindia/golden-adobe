import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '../../theme';
import { callPhone, openMapAt } from '../../utils/delivery';
import { Button, Card, Text } from '../ui';

type ContactBlockProps = {
  title: string;
  name: string;
  address: string;
  phone: string;
  lat: number | null;
  lng: number | null;
};

/** Pickup or drop: who, where, a call button, and a map button when coordinates exist. */
function ContactBlockComponent({ title, name, address, phone, lat, lng }: ContactBlockProps) {
  const hasCoordinates = lat !== null && lng !== null;
  return (
    <Card style={styles.card}>
      <Text variant="label" color={Colors.inkSoft}>
        {title}
      </Text>
      <Text variant="bodyMedium">{name}</Text>
      <Text variant="body" color={Colors.inkSoft}>
        {address}
      </Text>
      <View style={styles.actions}>
        <Button title="Call" variant="secondary" onPress={() => callPhone(phone)} />
        {hasCoordinates ? (
          <Button title="Open map" variant="ghost" onPress={() => openMapAt(lat, lng)} />
        ) : null}
      </View>
    </Card>
  );
}

export const ContactBlock = memo(ContactBlockComponent);

const styles = StyleSheet.create({
  card: { gap: Spacing.xs },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
