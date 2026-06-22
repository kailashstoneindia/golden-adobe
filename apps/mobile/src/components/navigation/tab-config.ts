import { Role } from '@golden-abode/types';
import type { ComponentType } from 'react';

import {
  BrowseIcon,
  CartIcon,
  HomeIcon,
  OrdersIcon,
  ProductsIcon,
  ShopIcon,
  VendorHomeIcon,
  YouIcon,
} from './TabIcons';

export type TabRouteName =
  | 'index'
  | 'browse'
  | 'cart'
  | 'orders'
  | 'you'
  | 'products'
  | 'shop';

interface TabIconProps {
  color: string;
  size?: number;
}

export interface TabItem {
  routeName: TabRouteName;
  label: string;
  Icon: ComponentType<TabIconProps>;
}

const CUSTOMER_TABS: TabItem[] = [
  { routeName: 'index', label: 'HOME', Icon: HomeIcon },
  { routeName: 'browse', label: 'BROWSE', Icon: BrowseIcon },
  { routeName: 'cart', label: 'CART', Icon: CartIcon },
  { routeName: 'orders', label: 'ORDERS', Icon: OrdersIcon },
  { routeName: 'you', label: 'YOU', Icon: YouIcon },
];

const VENDOR_TABS: TabItem[] = [
  { routeName: 'index', label: 'HOME', Icon: VendorHomeIcon },
  { routeName: 'products', label: 'PRODUCTS', Icon: ProductsIcon },
  { routeName: 'orders', label: 'ORDERS', Icon: OrdersIcon },
  { routeName: 'shop', label: 'SHOP', Icon: ShopIcon },
];

export function getTabsForRole(role?: Role): TabItem[] {
  if (role === Role.VENDOR) {
    return VENDOR_TABS;
  }

  return CUSTOMER_TABS;
}
