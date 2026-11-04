import type { PrimaryImage } from '@golden-abode/types';
import { memo, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors } from '../../theme';
import { Text } from '../ui';

type ProductImageProps = {
  image: PrimaryImage | null | undefined;
  /** `thumb` for list cards, `large` for the product hero. */
  size: keyof PrimaryImage;
  style: StyleProp<ViewStyle>;
  placeholderLabel?: string;
};

/**
 * A product's primary image (decision 0033), or a neutral placeholder when
 * the product has none or the URL fails to load.
 */
function ProductImageComponent({
  image,
  size,
  style,
  placeholderLabel = 'No image',
}: ProductImageProps) {
  const [hasFailed, setHasFailed] = useState(false);
  const uri = image?.[size];

  return (
    <View style={[styles.frame, style]}>
      {uri && !hasFailed ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          onError={() => setHasFailed(true)}
        />
      ) : (
        <Text variant="caption" color={Colors.subtle}>
          {placeholderLabel}
        </Text>
      )}
    </View>
  );
}

export const ProductImage = memo(ProductImageComponent);

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
