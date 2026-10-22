import type {
  OrderDto,
  OrderVendorGroupDto,
  OrderVendorGroupStatus,
  PaymentEventDto,
} from '@golden-abode/types';

export type OrderDetailModalProps = {
  order: OrderDto;
  isSubmitting: boolean;
  actionError: string | null;
  onClose: () => void;
  onRefund: (orderId: string) => Promise<void>;
  onCancel: (orderId: string) => Promise<void>;
  onOverrideStatus: (options: {
    groupId: string;
    status: OrderVendorGroupStatus;
    reason: string;
  }) => Promise<void>;
};

export type VendorGroupBlockProps = {
  group: OrderVendorGroupDto;
};

export type PaymentEventsListProps = {
  events: PaymentEventDto[];
};
