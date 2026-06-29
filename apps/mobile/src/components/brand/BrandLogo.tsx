import { Image, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

const logoMark = require('../../../assets/logo-mark.png');

export interface BrandLogoProps {
  /** Logo width in density-independent pixels. Height scales with aspect ratio. */
  size?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
}

/**
 * Kailash Stones logo mark — mountain ridge with tangerine sunrise.
 * Used on splash, login, and other branded surfaces.
 */
export function BrandLogo({ size = 120, style, imageStyle }: BrandLogoProps) {
  return (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      <Image
        source={logoMark}
        style={[styles.image, imageStyle]}
        resizeMode="contain"
        accessibilityLabel="Kailash Stones logo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
