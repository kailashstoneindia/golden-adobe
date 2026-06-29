import type { BadgeVariant } from '../components/ui/Badge';

export interface DemoOrder {
  id: string;
  customer: string;
  summary: string;
  status: string;
  badge: BadgeVariant;
}

export interface DemoProject {
  name: string;
  detail: string;
  status: string;
  badge: BadgeVariant;
}

export interface DemoAddress {
  label: string;
  line: string;
  isDefault?: boolean;
}

export interface DemoCartGroup {
  vendor: string;
  items: { name: string; qty: string; price: string }[];
  subtotal: string;
}

export const DEMO_VENDORS = [
  { id: 'kailash', name: 'Kailash Stones', category: 'Stones · 4.8★' },
  { id: 'sharma', name: 'Sharma Hardware', category: 'Hardware · 4.6★' },
  { id: 'jaipur', name: 'Jaipur Pipes & Fittings', category: 'Plumbing · 4.5★' },
] as const;

export const DEMO_CART_GROUPS: DemoCartGroup[] = [
  {
    vendor: 'Kailash Stones',
    items: [{ name: 'Kota Stone, Beige', qty: '50 sq ft', price: '₹3,400' }],
    subtotal: '₹3,400',
  },
  {
    vendor: 'Sharma Hardware',
    items: [{ name: 'PVC Pipe, 2"', qty: '12 pieces', price: '₹1,860' }],
    subtotal: '₹1,860',
  },
];

export const DEMO_CUSTOMER_ORDERS: DemoOrder[] = [
  {
    id: 'GA1042',
    customer: 'Sharma Residence',
    summary: '2 vendors · 7 items',
    status: 'Out for delivery',
    badge: 'info',
  },
  {
    id: 'GA1039',
    customer: 'Mehta Residence',
    summary: 'Sharma Hardware · 1 item',
    status: 'Delivered',
    badge: 'success',
  },
];

export const DEMO_VENDOR_ORDERS: DemoOrder[] = [
  {
    id: 'GA1042',
    customer: 'Sharma Residence',
    summary: 'Kota Stone × 50 sq ft',
    status: 'New',
    badge: 'pending',
  },
  {
    id: 'GA1039',
    customer: 'Mehta Residence',
    summary: 'PVC Pipe × 8',
    status: 'Dispatched',
    badge: 'info',
  },
];

export const DEMO_PROJECTS: DemoProject[] = [
  {
    name: 'Sharma Residence',
    detail: 'Plot 14, Vaishali Nagar, Jaipur East',
    status: 'Active',
    badge: 'info',
  },
  {
    name: 'Mehta Residence',
    detail: 'C-Scheme, Jaipur',
    status: 'Planning',
    badge: 'pending',
  },
];

export const DEMO_ACTIVE_PROJECTS: DemoProject[] = [
  {
    name: 'Sharma Residence',
    detail: 'Kota Stone, 50 sq ft · ETA 4:30 PM',
    status: 'Arriving today',
    badge: 'info',
  },
  {
    name: 'Mehta Residence',
    detail: 'PVC Pipe × 8 · Checked-in yesterday',
    status: 'Delivered',
    badge: 'success',
  },
];

export const DEMO_ADDRESSES: DemoAddress[] = [
  {
    label: 'Sharma Residence',
    line: 'Plot 14, Vaishali Nagar, Jaipur East',
    isDefault: true,
  },
  {
    label: 'Mehta Residence',
    line: '12, C-Scheme, Jaipur',
  },
];

export const DEMO_PRODUCTS = [
  { name: 'Kota Stone, Beige', category: 'Stones & Tiles', price: '₹68/sq ft', stock: '800 sq ft' },
  { name: 'PVC Pipe, 2"', category: 'Plumbing', price: '₹155/piece', stock: '240 pcs' },
  { name: 'Emulsion Paint, Off-white', category: 'Paints', price: '₹420/litre', stock: '36 L' },
];

export const DEMO_FAQ = [
  {
    q: 'How do I track my order?',
    a: 'Open Orders and tap an active order to see the Ridge Tracker.',
  },
  {
    q: 'Can I order from multiple vendors?',
    a: 'Yes — your cart groups items by shop before checkout.',
  },
  { q: 'How do Ustaads get verified?', a: 'Admin reviews profiles before they appear in search.' },
];
