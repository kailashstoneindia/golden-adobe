import Svg, { Circle, Path, Rect } from 'react-native-svg';

interface TabIconProps {
  color: string;
  size?: number;
}

const STROKE = 1.8;

export function HomeIcon({ color, size = 20 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 11l9-7 9 7" stroke={color} strokeWidth={STROKE} />
      <Path d="M5 10v10h14V10" stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

export function BrowseIcon({ color, size = 20 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth={STROKE} />
      <Path d="M21 21l-4-4" stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

export function CartIcon({ color, size = 20 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 7h12l-1 13H7L6 7z" stroke={color} strokeWidth={STROKE} />
      <Path d="M9 7a3 3 0 0 1 6 0" stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

export function OrdersIcon({ color, size = 20 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="4" y="4" width="16" height="16" rx="2" stroke={color} strokeWidth={STROKE} />
      <Path d="M8 9h8M8 13h8M8 17h4" stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

export function YouIcon({ color, size = 20 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="3.5" stroke={color} strokeWidth={STROKE} />
      <Path d="M5 20c1.5-4 4-5.5 7-5.5S17.5 16 19 20" stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

export function VendorHomeIcon({ color, size = 20 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="4" y="4" width="7" height="7" stroke={color} strokeWidth={STROKE} />
      <Rect x="13" y="4" width="7" height="7" stroke={color} strokeWidth={STROKE} />
      <Rect x="4" y="13" width="7" height="7" stroke={color} strokeWidth={STROKE} />
      <Rect x="13" y="13" width="7" height="7" stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

export function ProductsIcon({ color, size = 20 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="4" y="7" width="16" height="13" rx="2" stroke={color} strokeWidth={STROKE} />
      <Path d="M9 7V5a3 3 0 0 1 6 0v2" stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

export function ShopIcon({ color, size = 20 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="3.5" stroke={color} strokeWidth={STROKE} />
      <Path d="M5 20c1.5-4 4-5.5 7-5.5S17.5 16 19 20" stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}
