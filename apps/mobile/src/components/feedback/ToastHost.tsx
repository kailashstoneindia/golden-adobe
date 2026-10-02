import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TOAST_CONSTANTS } from '../../constants/toast.constants';
import { useToastStore } from '../../stores/useToastStore';
import { Colors, Radius, Spacing } from '../../theme';
import type { ToastVariant } from '../../types/toast.types';
import { Text } from '../ui';

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const toast = useToastStore((toastStore) => toastStore.toast);
  const hideToast = useToastStore((toastStore) => toastStore.hideToast);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    if (!toast) {
      return;
    }
    opacity.setValue(0);
    translateY.setValue(-12);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: TOAST_CONSTANTS.animationMs,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: TOAST_CONSTANTS.animationMs,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, toast, translateY]);

  if (!toast) {
    return null;
  }

  const palette = getToastPalette(toast.variant);

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Animated.View
        style={[
          styles.toast,
          {
            marginTop: insets.top + Spacing.sm,
            backgroundColor: palette.background,
            borderColor: palette.border,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <Pressable onPress={hideToast} style={styles.pressable}>
          <Text variant="caption" color={palette.label} style={styles.label}>
            {formatVariantLabel(toast.variant)}
          </Text>
          <Text variant="bodyMedium" color={palette.text} style={styles.message}>
            {toast.message}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

type ToastPalette = {
  background: string;
  border: string;
  text: string;
  label: string;
};

function getToastPalette(variant: ToastVariant): ToastPalette {
  if (variant === 'success') {
    return {
      background: Colors.sageTint,
      border: Colors.sage,
      text: Colors.ink,
      label: Colors.sage,
    };
  }
  if (variant === 'error') {
    return {
      background: Colors.brickTint,
      border: Colors.brick,
      text: Colors.ink,
      label: Colors.brick,
    };
  }
  if (variant === 'warning') {
    return {
      background: Colors.tangerineTint,
      border: Colors.tangerine,
      text: Colors.ink,
      label: Colors.ember,
    };
  }
  return {
    background: Colors.skyTint,
    border: Colors.sky,
    text: Colors.ink,
    label: Colors.sky,
  };
}

function formatVariantLabel(variant: ToastVariant): string {
  if (variant === 'success') return 'Success';
  if (variant === 'error') return 'Error';
  if (variant === 'warning') return 'Warning';
  return 'Info';
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
    alignItems: 'center',
  },
  toast: {
    width: '92%',
    maxWidth: 420,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    shadowColor: Colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  pressable: {
    gap: Spacing.xs,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  message: {
    lineHeight: 20,
  },
});
