import type { BadgeVariant } from '../components/ui/Badge';

export type DemoOrder = {
  id: string;
  customer: string;
  summary: string;
  status: string;
  badge: BadgeVariant;
};

export type DemoProject = {
  name: string;
  detail: string;
  status: string;
  badge: BadgeVariant;
};

export type DemoAddress = {
  label: string;
  line: string;
  isDefault?: boolean;
};

export type DemoCartGroup = {
  vendor: string;
  items: { name: string; qty: string; price: string }[];
  subtotal: string;
};
