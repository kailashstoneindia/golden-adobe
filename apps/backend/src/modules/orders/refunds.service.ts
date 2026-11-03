import { randomUUID } from 'crypto';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Sequelize } from 'sequelize-typescript';
import { Op, QueryTypes, Transaction } from 'sequelize';
import type { RefundDto } from '@golden-abode/types';
import { Order, OrderStatus } from './models/order.model';
import { Refund, RefundRail, RefundStatus } from './models/refund.model';
import { toRefundDto } from './order-display.mapper';
import { projectOrderStatus } from './refund-status';
import { NOTIFICATION_SERVICE, NotificationService } from '../notifications/notification.interface';
import {
  PAYMENT_PROVIDER,
  PaymentProviderService,
  ProviderErrorKind,
  ProviderRefund,
  ProviderRequestError,
} from '../payments/payment-provider.interface';
import { toPaise } from '../payments/money';

// Decision 0054 rule 5: a refund is retried at most this many times, waiting
// this long before each attempt, always with the stored key and body.
export const REFUND_SUBMIT_RETRY_DELAYS_MS = [0, 1000, 2000];

const RETRYABLE_KINDS: ProviderErrorKind[] = [
  'timeout',
  'network',
  'server',
  'conflict_in_progress',
];

const REFUND_EXCEEDS_MESSAGE = 'refund exceeds the refundable amount';

// An order in any of these has (or had) a captured payment attached. The
// pending and refunded ones are let through so the amount check below gives
// the honest answer: nothing left to refund.
const REFUNDABLE_ORDER_STATUSES: string[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.REFUND_REQUIRED,
  OrderStatus.REFUND_PENDING,
  OrderStatus.REFUNDED,
];

type LockedOrder = {
  id: string;
  customer_id: string;
  status: OrderStatus;
  grand_total: string;
  razorpay_payment_id: string | null;
};

type Transition = { orderId: string; customerId: string; from: OrderStatus; to: OrderStatus };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Decision 0054 rules 5-6. A refund is a row first (written under a lock on the
// order so the refundable amount cannot be over-committed), then a Razorpay
// call made with no transaction open, then a status that follows what
// Razorpay reports.
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @InjectModel(Order) private readonly orderModel: typeof Order,
    @InjectModel(Refund) private readonly refundModel: typeof Refund,
    private readonly sequelize: Sequelize,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProviderService,
    @Inject(NOTIFICATION_SERVICE) private readonly notifications: NotificationService,
    private readonly configService: ConfigService,
  ) {}

  async requestRefund(input: {
    orderId: string;
    adminUserId: string;
    reason: string;
    amountPaise?: number;
    vendorGroupId?: string;
  }): Promise<RefundDto> {
    // Step A: record the refund and project the order status, in one
    // transaction holding the order's row lock. Committed before Razorpay is
    // called.
    const { refund, transition } = await this.sequelize.transaction(async (t) => {
      const order = await this.lockOrder(input.orderId, t);
      if (!order) {
        throw new NotFoundException('order not found');
      }
      if (!REFUNDABLE_ORDER_STATUSES.includes(order.status) || !order.razorpay_payment_id) {
        throw new BadRequestException('order has no captured payment to refund');
      }

      const capturedPaise = toPaise(order.grand_total);
      const [totals] = await this.sequelize.query<{ taken: string; total: string }>(
        `SELECT COALESCE(SUM(amount_paise) FILTER (WHERE status <> :failed), 0) AS taken,
                COUNT(*) AS total
         FROM refunds WHERE order_id = :orderId`,
        {
          replacements: { orderId: order.id, failed: RefundStatus.FAILED },
          type: QueryTypes.SELECT,
          transaction: t,
        },
      );
      const remainingPaise = capturedPaise - Number(totals.taken);
      const amountPaise = input.amountPaise ?? remainingPaise;
      if (amountPaise <= 0 || amountPaise > remainingPaise) {
        throw new BadRequestException(REFUND_EXCEEDS_MESSAGE);
      }
      // A late payment has no order to keep partially intact (decision 0054
      // rule 4), so only a full refund settles it.
      if (order.status === OrderStatus.REFUND_REQUIRED && amountPaise !== capturedPaise) {
        throw new BadRequestException('a late payment must be refunded in full');
      }
      if (input.vendorGroupId) {
        const groups = await this.sequelize.query(
          `SELECT 1 FROM order_vendor_group WHERE id = :groupId AND order_id = :orderId`,
          {
            replacements: { groupId: input.vendorGroupId, orderId: order.id },
            type: QueryTypes.SELECT,
            transaction: t,
          },
        );
        if (groups.length === 0) {
          throw new BadRequestException('vendor group does not belong to this order');
        }
      }

      // Generated once and stored; every retry and the sync job reuse them
      // (decision 0054 rule 5).
      const created = await this.refundModel.create(
        {
          orderId: order.id,
          orderVendorGroupId: input.vendorGroupId ?? null,
          rail: RefundRail.RAZORPAY,
          razorpayPaymentId: order.razorpay_payment_id,
          amountPaise,
          idempotencyKey: randomUUID().replace(/-/g, ''),
          receipt: `rf_${order.id.replace(/-/g, '')}_${Number(totals.total) + 1}`,
          status: RefundStatus.REQUESTED,
          reason: input.reason,
          createdBy: input.adminUserId,
        } as never,
        { transaction: t },
      );
      const projected = await this.project(order, t);
      return { refund: created, transition: projected };
    });
    await this.notifyIfRefunded(transition);

    // Step B: Razorpay, with no transaction held.
    await this.submit(refund);

    const latest = await this.refundModel.findByPk(refund.id);
    return toRefundDto(latest ?? refund);
  }

  async listForOrder(orderId: string): Promise<RefundDto[]> {
    const order = await this.orderModel.findByPk(orderId, { attributes: ['id'] });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    const refunds = await this.refundModel.findAll({
      where: { orderId },
      order: [['createdAt', 'ASC']],
    });
    return refunds.map(toRefundDto);
  }

  // Decision 0054 rule 6. Same worker-mode gate as the stale-reservation sweep.
  // Age is measured on updated_at: the time since the row last changed.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncRefunds(): Promise<void> {
    if (this.configService.get<string>('search.workerMode', 'all') === 'api') {
      return;
    }

    const open = await this.refundModel.findAll({
      where: {
        rail: RefundRail.RAZORPAY,
        status: [RefundStatus.REQUESTED, RefundStatus.SUBMITTED],
        updatedAt: { [Op.lt]: this.sequelize.literal(`now() - interval '5 minutes'`) },
      },
      order: [['createdAt', 'ASC']],
    });

    for (const refund of open) {
      try {
        if (refund.status === RefundStatus.REQUESTED) {
          await this.submit(refund);
        } else {
          await this.syncSubmitted(refund);
        }
      } catch (err) {
        // One refund's failure must not stop the rest of the sync.
        this.logger.error(
          `refund ${refund.id}: sync failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // Sends a requested refund to Razorpay with its stored key. A refund
  // Razorpay turns down is failed and surfaced as a 400.
  private async submit(refund: Refund): Promise<void> {
    let lastError: unknown;
    for (const delayMs of REFUND_SUBMIT_RETRY_DELAYS_MS) {
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      let result: ProviderRefund;
      try {
        result = await this.paymentProvider.createRefund({
          paymentId: refund.razorpayPaymentId!,
          amountPaise: refund.amountPaise,
          receipt: refund.receipt,
          idempotencyKey: refund.idempotencyKey,
          notes: { order_id: refund.orderId, refund_id: refund.id },
        });
      } catch (err) {
        if (err instanceof ProviderRequestError && err.kind === 'client') {
          await this.markFailed(refund);
          throw new BadRequestException(err.message);
        }
        lastError = err;
        if (err instanceof ProviderRequestError && RETRYABLE_KINDS.includes(err.kind)) {
          continue;
        }
        break;
      }
      await this.recordProviderRefund(refund, result);
      return;
    }

    // Retries are spent. The last response may have been lost after Razorpay
    // created the refund, so look for one carrying our receipt before leaving
    // the row for the sync job.
    const adopted = await this.findByReceipt(refund);
    if (adopted) {
      await this.recordProviderRefund(refund, adopted);
      return;
    }
    this.logger.error(
      `refund ${refund.id} (order ${refund.orderId}): Razorpay did not accept the refund (${
        lastError instanceof Error ? lastError.message : String(lastError)
      }); left requested for the sync job`,
    );
  }

  private async findByReceipt(refund: Refund): Promise<ProviderRefund | undefined> {
    try {
      const existing = await this.paymentProvider.fetchRefunds(refund.razorpayPaymentId!);
      return existing.find((r) => r.receipt === refund.receipt);
    } catch (err) {
      this.logger.warn(
        `refund ${refund.id}: could not list Razorpay refunds: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return undefined;
    }
  }

  private async syncSubmitted(refund: Refund): Promise<void> {
    if (!refund.razorpayRefundId) {
      return;
    }
    const current = await this.paymentProvider.fetchRefund(
      refund.razorpayPaymentId!,
      refund.razorpayRefundId,
    );
    if (current.status === 'processed' || current.status === 'failed') {
      await this.setStatus(refund, RefundStatus.SUBMITTED, current.status as RefundStatus);
    }
  }

  private async recordProviderRefund(refund: Refund, result: ProviderRefund): Promise<void> {
    // Guarded on 'requested': a concurrent submit or sync that got here first
    // has already recorded this same refund.
    const next =
      result.status === 'processed'
        ? RefundStatus.PROCESSED
        : result.status === 'failed'
          ? RefundStatus.FAILED
          : RefundStatus.SUBMITTED;
    const [, updated] = await this.sequelize.query(
      `UPDATE refunds SET razorpay_refund_id = :providerRefundId, status = :next, updated_at = now()
       WHERE id = :id AND status = :requested`,
      {
        replacements: {
          id: refund.id,
          providerRefundId: result.id,
          next,
          requested: RefundStatus.REQUESTED,
        },
        type: QueryTypes.UPDATE,
      },
    );
    if (updated > 0) {
      await this.reproject(refund.orderId);
    }
  }

  private async markFailed(refund: Refund): Promise<void> {
    await this.setStatus(refund, RefundStatus.REQUESTED, RefundStatus.FAILED);
  }

  // Guarded status change followed by re-projecting the order. updated_at is
  // set by hand because the sync job reads it as "time since last change".
  private async setStatus(refund: Refund, from: RefundStatus, to: RefundStatus): Promise<void> {
    const [, updated] = await this.sequelize.query(
      `UPDATE refunds SET status = :to, updated_at = now() WHERE id = :id AND status = :from`,
      { replacements: { id: refund.id, from, to }, type: QueryTypes.UPDATE },
    );
    if (updated > 0) {
      await this.reproject(refund.orderId);
    }
  }

  private async reproject(orderId: string): Promise<void> {
    const transition = await this.sequelize.transaction(async (t) => {
      const order = await this.lockOrder(orderId, t);
      return order ? this.project(order, t) : null;
    });
    if (transition) {
      await this.notifyIfRefunded(transition);
    }
  }

  private lockOrder(orderId: string, t: Transaction): Promise<LockedOrder | undefined> {
    return this.sequelize
      .query<LockedOrder>(
        `SELECT id, customer_id, status, grand_total, razorpay_payment_id
         FROM orders WHERE id = :orderId FOR UPDATE`,
        { replacements: { orderId }, type: QueryTypes.SELECT, transaction: t },
      )
      .then((rows) => rows[0]);
  }

  // Must run in the transaction that holds the order's row lock.
  private async project(order: LockedOrder, t: Transaction): Promise<Transition> {
    const [sums] = await this.sequelize.query<{ processed: string; open: string }>(
      `SELECT COALESCE(SUM(amount_paise) FILTER (WHERE status = :processed), 0) AS processed,
              COALESCE(SUM(amount_paise) FILTER (WHERE status IN (:requested, :submitted)), 0) AS open
       FROM refunds WHERE order_id = :orderId`,
      {
        replacements: {
          orderId: order.id,
          processed: RefundStatus.PROCESSED,
          requested: RefundStatus.REQUESTED,
          submitted: RefundStatus.SUBMITTED,
        },
        type: QueryTypes.SELECT,
        transaction: t,
      },
    );
    const next = projectOrderStatus(
      order.status,
      toPaise(order.grand_total),
      Number(sums.processed),
      Number(sums.open),
    );
    if (next === order.status) {
      return { orderId: order.id, customerId: order.customer_id, from: next, to: next };
    }
    const [, updated] = await this.sequelize.query(
      `UPDATE orders SET status = :next, updated_at = now() WHERE id = :orderId AND status = :current`,
      {
        replacements: { orderId: order.id, next, current: order.status },
        type: QueryTypes.UPDATE,
        transaction: t,
      },
    );
    const to = updated > 0 ? next : order.status;
    return { orderId: order.id, customerId: order.customer_id, from: order.status, to };
  }

  // After commit, never inside the transaction: a failing notification must
  // not undo a refund status (decision 0054 rule 7).
  private async notifyIfRefunded(transition: Transition): Promise<void> {
    if (transition.to !== OrderStatus.REFUNDED || transition.from === OrderStatus.REFUNDED) {
      return;
    }
    try {
      await this.notifications.sendOrderStatusChanged(
        transition.customerId,
        transition.orderId,
        OrderStatus.REFUNDED,
      );
    } catch (err) {
      this.logger.error(
        `order ${transition.orderId}: refunded notification failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
