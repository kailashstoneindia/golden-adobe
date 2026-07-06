import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Polygon, RadialGradient, Stop } from 'react-native-svg';

import { Text } from '../ui';
import { Colors, FontFamily, Spacing } from '../../theme';

const SPLASH_GRADIENT = [Colors.navy, Colors.navyMid, Colors.sky] as const;
const SPLASH_GRADIENT_STOPS = [0, 0.45, 1] as const;

export function RidgeSplash() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const sunLeft = (screenWidth - 108) / 2;

  return (
    <LinearGradient
      colors={[...SPLASH_GRADIENT]}
      locations={[...SPLASH_GRADIENT_STOPS]}
      style={styles.gradient}
    >
      <View
        style={[styles.accentDot, { top: insets.top + 54, left: Spacing.xxl + Spacing.lg + 2 }]}
      />

      <View style={styles.center}>
        <View style={[styles.sunGlow, { left: sunLeft, top: '22%' }]}>
          <Svg width={108} height={108} viewBox="0 0 108 108">
            <Defs>
              <RadialGradient id="sunGlow" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0%" stopColor={Colors.sunCore} />
                <Stop offset="60%" stopColor={Colors.tangerine} />
                <Stop offset="75%" stopColor={Colors.tangerine} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={54} cy={54} r={54} fill="url(#sunGlow)" />
          </Svg>
        </View>

        <View style={styles.brand}>
          <Text color={Colors.white} style={styles.brandTitle}>
            KAILASH STONES
          </Text>
          <Text color="rgba(255,255,255,0.75)" style={styles.tagline}>
            Materials for the home you&apos;re building
          </Text>
        </View>
      </View>

      <View style={styles.ridge}>
        <Svg width="100%" height="100%" viewBox="0 0 300 140" preserveAspectRatio="none">
          <Polygon
            points="0,140 0,95 40,60 75,90 110,35 150,70 190,20 230,55 265,30 300,75 300,140"
            fill={Colors.ridgeSilhouette}
          />
          <Polygon
            points="110,35 150,70 190,20 200,40 150,80 120,55"
            fill={Colors.tangerine}
            opacity={0.85}
          />
        </Svg>
      </View>

      <View style={[styles.homeIndicator, { bottom: insets.bottom + 8 }]} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  accentDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.lavenderMist,
    opacity: 0.7,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunGlow: {
    position: 'absolute',
    width: 108,
    height: 108,
  },
  brand: {
    alignItems: 'center',
    zIndex: 2,
    marginTop: -30,
    paddingHorizontal: Spacing.xl,
  },
  brandTitle: {
    fontFamily: FontFamily.poppins.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: FontFamily.inter.regular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    textAlign: 'center',
  },
  ridge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
  },
  homeIndicator: {
    position: 'absolute',
    alignSelf: 'center',
    width: 120,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
});
