import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { BrandLogo } from '../brand/BrandLogo';
import { Text } from '../ui';
import { Colors, Spacing } from '../../theme';

/**
 * Branded splash — navy-to-sky gradient, ridge silhouette, and sun glow
 * lifted from the Kailash Stones logo (design doc § Customer 01).
 */
export function RidgeSplash() {
  return (
    <LinearGradient
      colors={[Colors.navy, Colors.navySoft, Colors.sky]}
      locations={[0, 0.45, 1]}
      style={styles.gradient}
    >
      <View style={styles.sunGlow} />
      <View style={styles.ridge}>
        <Svg width="100%" height="100%" viewBox="0 0 300 140" preserveAspectRatio="none">
          <Polygon
            points="0,140 0,95 40,60 75,90 110,35 150,70 190,20 230,55 265,30 300,75 300,140"
            fill={Colors.navy}
          />
          <Polygon
            points="110,35 150,70 190,20 200,40 150,80 120,55"
            fill={Colors.tangerine}
            opacity={0.85}
          />
        </Svg>
      </View>
      <View style={styles.brand}>
        <BrandLogo size={132} style={styles.logo} />
        <Text variant="h1" color={Colors.white} style={styles.brandTitle}>
          KAILASH STONES
        </Text>
        <Text variant="caption" color="rgba(255,255,255,0.75)" style={styles.tagline}>
          Materials for the home you&apos;re building
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sunGlow: {
    position: 'absolute',
    top: '22%',
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: Colors.tangerineTint,
    opacity: 0.55,
  },
  ridge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
  },
  brand: {
    alignItems: 'center',
    zIndex: 2,
    marginTop: 24,
  },
  logo: {
    marginBottom: Spacing.lg,
  },
  brandTitle: {
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  tagline: {
    marginTop: 8,
    textAlign: 'center',
  },
});
