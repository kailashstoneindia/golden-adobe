import type {
  AdminRefundRequest,
  OrderDto,
  OrderVendorGroupDto,
  OrderVendorGroupStatus,
  PaymentEventDto,
  RefundDto,
} from '@golden-abode/types';

export type OrderDetailModalProps = {
  order: OrderDto;
  isSubmitting: boolean;
  actionError: string | null;
  onClose: () => void;
  onRefund: (orderId: string, body: AdminRefundRequest) => Promise<void>;
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

export type RefundFormProps = {
  order: OrderDto;
  refunds: RefundDto[];
  isSubmitting: boolean;
  onRefund: OrderDetailModalProps['onRefund'];
};

export type RefundHistoryProps = {
  refunds: RefundDto[];
};
