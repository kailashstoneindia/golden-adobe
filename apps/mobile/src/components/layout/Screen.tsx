import type { ReactNode } from 'react';
import { StatusBar, StyleSheet, View, type StatusBarStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Colors } from '../../theme';

interface ScreenProps {
  children: ReactNode;
  /** Screen background. Defaults to cream canvas. */
  backgroundColor?: string;
  edges?: Edge[];
  statusBarStyle?: StatusBarStyle;
  statusBarBackgroundColor?: string;
}

/**
 * Base screen wrapper with safe-area insets and status bar handling.
 */
export function Screen({
  children,
  backgroundColor = Colors.cream,
  edges = ['top', 'bottom'],
  statusBarStyle = 'dark-content',
  statusBarBackgroundColor = backgroundColor,
}: ScreenProps) {
  return (
    <SafeAreaView style={[styles.root, { backgroundColor }]} edges={edges}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBackgroundColor} />
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
