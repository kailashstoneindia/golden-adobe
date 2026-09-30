import { type ComponentType } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { LAUNCH_CATEGORIES, type LaunchCategory } from '../../constants';
import { Colors, FontFamily, Radius } from '../../theme';
import { Text } from '../ui';

type CategoryIconProps = {
  color: string;
  size?: number;
};

type CategoryGridProps = {
  onCategoryPress?: (category: LaunchCategory) => void;
};

const ICON_SIZE = 26;
const STROKE = 2;

type CategoryVisual = {
  bg: string;
  iconColor: string;
  Icon: ComponentType<CategoryIconProps>;
};

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

function LightsIcon({ color, size = ICON_SIZE }: CategoryIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10c-.8.8-1.2 1.5-1.4 2.5H9.4C9.2 14.5 8.8 13.8 8 13a6 6 0 0 1 4-10z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const CATEGORY_VISUALS: Record<LaunchCategory['id'], CategoryVisual> = {
  electrical: {
    bg: Colors.categoryElectricalBg,
    iconColor: Colors.tangerine,
    Icon: ElectricalIcon,
  },
  plumbing: {
    bg: Colors.skyTint,
    iconColor: Colors.sky,
    Icon: PlumbingIcon,
  },
  sanitaryware: {
    bg: Colors.categorySanitaryBg,
    iconColor: Colors.categorySanitaryIcon,
    Icon: SanitarywareIcon,
  },
  hardware: {
    bg: Colors.categoryHardwareBg,
    iconColor: Colors.categoryHardwareIcon,
    Icon: HardwareIcon,
  },
  lights: {
    bg: Colors.skyTint,
    iconColor: Colors.navySoft,
    Icon: LightsIcon,
  },
  tiles: {
    bg: Colors.categoryStonesBg,
    iconColor: Colors.categoryStonesIcon,
    Icon: StonesTilesIcon,
  },
  paint: {
    bg: Colors.categoryPaintsBg,
    iconColor: Colors.categoryPaintsIcon,
    Icon: PaintsIcon,
  },
  stone: {
    bg: Colors.categoryStonesBg,
    iconColor: Colors.categoryStonesIcon,
    Icon: StonesTilesIcon,
  },
};

export function CategoryGrid({ onCategoryPress }: CategoryGridProps) {
  return (
    <View style={styles.grid}>
      {LAUNCH_CATEGORIES.map((category) => {
        const visual = CATEGORY_VISUALS[category.id];
        return (
          <Pressable
            key={category.id}
            style={styles.item}
            onPress={() => onCategoryPress?.(category)}
          >
            <View style={[styles.tile, { backgroundColor: visual.bg }]}>
              <visual.Icon color={visual.iconColor} />
            </View>
            <Text style={styles.label}>{category.name}</Text>
          </Pressable>
        );
      })}
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
