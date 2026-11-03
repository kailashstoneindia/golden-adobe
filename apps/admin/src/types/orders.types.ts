import type {
  AdminRefundRequest,
  OrderDto,
  OrderVendorGroupDto,
  OrderVendorGroupStatus,
  PaymentEventDto,
  RefundDto,
} from '@golden-abode/types';

// 'done' and 'pending' both mean the refund row exists, so the form is
// cleared; only 'failed' leaves it as typed for a correction.
export type RefundOutcome = 'done' | 'pending' | 'failed';

export type RefundNotice = {
  tone: 'pending' | 'error';
  text: string;
};

export type OrderDetailModalProps = {
  order: OrderDto;
  isSubmitting: boolean;
  actionError: string | null;
  refundNotice: RefundNotice | null;
  onClose: () => void;
  onRefund: (orderId: string, body: AdminRefundRequest) => Promise<RefundOutcome>;
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
