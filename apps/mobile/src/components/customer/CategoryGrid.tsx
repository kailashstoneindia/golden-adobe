import { type ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Colors, FontFamily, Radius } from '../../theme';
import { Text } from '../ui';

interface CategoryIconProps {
  color: string;
  size?: number;
}

const ICON_SIZE = 26;
const STROKE = 2;

function PlumbingIcon({ color, size = ICON_SIZE }: CategoryIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12h14M12 5l7 7-7 7" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

function ElectricalIcon({ color, size = ICON_SIZE }: CategoryIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function StonesTilesIcon({ color, size = ICON_SIZE }: CategoryIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="7" height="7" stroke={color} strokeWidth={STROKE} />
      <Rect x="14" y="3" width="7" height="7" stroke={color} strokeWidth={STROKE} />
      <Rect x="3" y="14" width="7" height="7" stroke={color} strokeWidth={STROKE} />
      <Rect x="14" y="14" width="7" height="7" stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

function SanitarywareIcon({ color, size = ICON_SIZE }: CategoryIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2c3 4 6 7 6 11a6 6 0 1 1-12 0c0-4 3-7 6-11z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function PaintsIcon({ color, size = ICON_SIZE }: CategoryIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 16l5-5 4 4 9-9" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Path d="M5 21h14" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

function HardwareIcon({ color, size = ICON_SIZE }: CategoryIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={STROKE} />
      <Path
        d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const CATEGORIES = [
  { name: 'Plumbing', bg: Colors.skyTint, iconColor: Colors.sky, Icon: PlumbingIcon },
  {
    name: 'Electrical',
    bg: Colors.categoryElectricalBg,
    iconColor: Colors.tangerine,
    Icon: ElectricalIcon,
  },
  {
    name: 'Stones & Tiles',
    bg: Colors.categoryStonesBg,
    iconColor: Colors.categoryStonesIcon,
    Icon: StonesTilesIcon,
  },
  {
    name: 'Sanitaryware',
    bg: Colors.categorySanitaryBg,
    iconColor: Colors.categorySanitaryIcon,
    Icon: SanitarywareIcon,
  },
  {
    name: 'Paints',
    bg: Colors.categoryPaintsBg,
    iconColor: Colors.categoryPaintsIcon,
    Icon: PaintsIcon,
  },
  {
    name: 'Hardware',
    bg: Colors.categoryHardwareBg,
    iconColor: Colors.categoryHardwareIcon,
    Icon: HardwareIcon,
  },
] as const satisfies ReadonlyArray<{
  name: string;
  bg: string;
  iconColor: string;
  Icon: ComponentType<CategoryIconProps>;
}>;

export function CategoryGrid() {
  return (
    <View style={styles.grid}>
      {CATEGORIES.map((cat) => (
        <View key={cat.name} style={styles.item}>
          <View style={[styles.tile, { backgroundColor: cat.bg }]}>
            <cat.Icon color={cat.iconColor} />
          </View>
          <Text style={styles.label}>{cat.name}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  item: {
    width: '31%',
    alignItems: 'center',
    gap: 7,
  },
  tile: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: FontFamily.poppins.semibold,
    fontSize: 10,
    color: Colors.ink,
    textAlign: 'center',
  },
});
