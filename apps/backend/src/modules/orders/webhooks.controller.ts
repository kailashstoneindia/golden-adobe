import {
  BadRequestException,
  Controller,
  Headers,
  Inject,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { Order } from './models/order.model';
import { OrderPaymentService } from './order-payment.service';
import { PAYMENT_PROVIDER, PaymentProviderService } from '../payments/payment-provider.interface';
import { toProviderPayment } from '../payments/razorpay-mappers';

// Not behind JwtAuthGuard — Razorpay calls this directly, server to server.
// Signature verification (decision 0041 rule 3) IS the authentication.
@ApiExcludeController()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    @InjectModel(Order) private readonly orderModel: typeof Order,
    private readonly sequelize: Sequelize,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProviderService,
    private readonly orderPayment: OrderPaymentService,
  ) {}

  @Post('razorpay')
  async handleRazorpayWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    if (!this.paymentProvider.verifyWebhookSignature(rawBody, signature ?? '')) {
      throw new BadRequestException('invalid webhook signature');
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.event;
    const entity = payload.payload?.payment?.entity;
    const providerOrderId = entity?.order_id;

    if (!providerOrderId) {
      this.logger.warn(`webhook event ${eventType} had no order_id in payload — ignoring`);
      return { received: true };
    }

    const order = await this.orderModel.findOne({ where: { razorpayOrderId: providerOrderId } });
    if (!order) {
      this.logger.warn(`webhook referenced unknown razorpay_order_id ${providerOrderId}`);
      return { received: true };
    }

    // Decision 0054 rule 7. The unique event_id only stops a redelivery from
    // being stored twice; it is not a gate. Processing continues either way
    // because applyCapture is idempotent, and a first delivery that stored its
    // event and then crashed must be able to finish on Razorpay's retry.
    await this.sequelize.query(
      `INSERT INTO payment_events (id, order_id, event_type, raw_payload, event_id)
       VALUES (gen_random_uuid(), :orderId, :eventType, CAST(:rawPayload AS jsonb), :eventId)
       ON CONFLICT (event_id) DO NOTHING`,
      {
        replacements: {
          orderId: order.id,
          eventType,
          rawPayload: rawBody,
          eventId: eventId ?? null,
        },
        type: QueryTypes.INSERT,
      },
    );

    if (eventType === 'payment.captured') {
      await this.orderPayment.applyCapture(order, toProviderPayment(entity));
    } else if (eventType === 'payment.failed') {
      // Final review finding #1: this used to call releaseOrder, which
      // CANCELLED the order outright. Razorpay's own documented behaviour
      // is that an order stays open and payable after a failed attempt —
      // UPI retries after a wrong PIN or an insufficient-balance failure
      // are the expected, common case, not an edge case. Cancelling here
      // meant a customer's successful retry on the SAME razorpay_order_id
      // then arrived as a "capture on a non-pending order" and was
      // silently dropped as a replay: money captured, order cancelled,
      // stock released and resold to someone else, nobody told.
      //
      // The correct behaviour is to do nothing to the order or the
      // reservation on a failed attempt — leave it pending-payment, able
      // to accept a retry's eventual capture. This reintroduces decision
      // 0041's own open question ("how long a reservation may be held
      // before it is swept") as now REACHABLE rather than hypothetical;
      // recorded as such in decision 0041 rather than silently left as a
      // TODO (see docs/decisions/0041-cart-owner-reservation-and-real-instock.md).
      this.logger.log(
        `order ${order.id}: payment.failed received — leaving pending_payment for a possible retry, no reservation change`,
      );
    }

    return { received: true };
  }
}
