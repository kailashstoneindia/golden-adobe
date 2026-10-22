import type {
  CartItemDto,
  CustomerAddressDto,
  OrderDto,
  OrderItemDto,
  OrderVendorGroupDto,
  VendorOrderGroupDto,
} from '@golden-abode/types';

export type CartVendorGroup = {
  vendorId: string;
  shopName: string;
  minOrderValue: number | null;
  items: CartItemDto[];
  subtotal: number;
  shortfall: number;
};

export type PriceSummary = {
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  isDiscountApplied: boolean;
};

export type PriceSummaryProps = {
  summary: PriceSummary;
};

export type PriceSummaryRowProps = {
  label: string;
  value: string;
  isEmphasized?: boolean;
};

export type CartVendorGroupCardProps = {
  group: CartVendorGroup;
  isUpdating: boolean;
  isReadOnly?: boolean;
  onIncrease: (item: CartItemDto) => void;
  onDecrease: (item: CartItemDto) => void;
  onRemove: (item: CartItemDto) => void;
};

export type CartLineRowProps = {
  item: CartItemDto;
  isUpdating: boolean;
  isReadOnly?: boolean;
  onIncrease: (item: CartItemDto) => void;
  onDecrease: (item: CartItemDto) => void;
  onRemove: (item: CartItemDto) => void;
};

export type AddressCardProps = {
  address: CustomerAddressDto;
  isSelected?: boolean;
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

export type AddressFormValues = {
  label: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  pincode: string;
  isDefault: boolean;
};

export type AddressFormProps = {
  values: AddressFormValues;
  isSubmitting: boolean;
  submitLabel: string;
  onChange: (field: keyof AddressFormValues, value: string | boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export type OrderListRowProps = {
  order: OrderDto;
  onPress: (orderId: string) => void;
};

export type VendorGroupListRowProps = {
  group: VendorOrderGroupDto;
  onPress: (groupId: string) => void;
};

export type OrderVendorSectionProps = {
  group: OrderVendorGroupDto;
};

export type OrderItemRowProps = {
  item: OrderItemDto;
};

export type FulfilmentStepperProps = {
  status: OrderVendorGroupDto['status'];
};

export type VendorStatusActionsProps = {
  group: VendorOrderGroupDto;
  isUpdating: boolean;
  onSelectStatus: (groupId: string, status: VendorOrderGroupDto['status']) => void;
};

export type PendingOrdersPreviewProps = {
  onSeeAllPress: () => void;
};

export type CustomerOrderDetailProps = {
  orderId: string;
};

export type VendorOrderDetailProps = {
  groupId: string;
};

export type StatusActionButtonProps = {
  groupId: string;
  status: VendorOrderGroupDto['status'];
  isUpdating: boolean;
  onSelectStatus: VendorStatusActionsProps['onSelectStatus'];
};
