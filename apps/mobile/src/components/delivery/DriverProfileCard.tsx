import { Role } from '@golden-abode/types';
import { StyleSheet } from 'react-native';

import { ERROR_MESSAGES } from '../../constants';
import { useAuth } from '../../hooks/auth';
import { useDriverProfileQuery } from '../../hooks/delivery';
import { Colors, Spacing } from '../../theme';
import { Card, Text } from '../ui';

/** Helper and vehicle are set by ops; either can be missing. */
export function DriverProfileCard() {
  const { user } = useAuth();
  const profileQuery = useDriverProfileQuery(user?.role === Role.DRIVER);
  const profile = profileQuery.data;

  if (profileQuery.isLoading) {
    return null;
  }
  if (!profile) {
    return (
      <Card>
        <Text variant="caption" color={Colors.brick}>
          {ERROR_MESSAGES.driverProfileFailed}
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Text variant="label" color={Colors.inkSoft}>
        Vehicle
      </Text>
      <Text variant="body">
        {profile.vehicle
          ? `${profile.vehicle.registrationNumber} · ${profile.vehicle.type}`
          : 'No vehicle assigned'}
      </Text>
      <Text variant="label" color={Colors.inkSoft} style={styles.sectionGap}>
        Helper
      </Text>
      <Text variant="body">
        {profile.helper ? `${profile.helper.name} · ${profile.helper.phone}` : 'No helper assigned'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionGap: { marginTop: Spacing.md },
});
