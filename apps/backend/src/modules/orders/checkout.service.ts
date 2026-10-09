import { BadRequestException, Inject, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { Order, OrderStatus } from './models/order.model';
import { OrderVendorGroup, OrderVendorGroupStatus } from './models/order-vendor-group.model';
import { OrderItem } from './models/order-item.model';
import { CartService } from '../cart/cart.service';
import { CustomersService } from '../customers/customers.service';
import { CustomerAddress } from '../customers/models/customer-address.model';
import { PAYMENT_PROVIDER, PaymentProviderService } from '../payments/payment-provider.interface';
import { VendorListingStatus } from '../catalog/models/vendor-listing.model';
import { SaleUnitType } from '../catalog/models/master-product.model';

interface CartLineForCheckout {
  cart_item_id: string;
  vendor_listing_id: string;
  master_product_id: string;
  vendor_id: string;
  quantity: string;
  price: string;
  min_order_qty: string;
  listing_status: string;
  sale_unit_type: string;
  vendor_is_active: boolean;
  quantity_available: string | null;
  quantity_reserved: string | null;
}

interface CheckoutRejection {
  vendorListingId: string;
  reason: string;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    @InjectModel(Order) private readonly orderModel: typeof Order,
    @InjectModel(OrderVendorGroup) private readonly groupModel: typeof OrderVendorGroup,
    @InjectModel(OrderItem) private readonly itemModel: typeof OrderItem,
    @InjectModel(CustomerAddress) private readonly addressModel: typeof CustomerAddress,
    private readonly sequelize: Sequelize,
    private readonly cartService: CartService,
    private readonly customersService: CustomersService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProviderService,
  ) {}

  async checkout(userId: string, deliveryAddressId: string): Promise<Order> {
    const customer = await this.customersService.resolveCustomerByUserId(userId);

    const address = await this.addressModel.findOne({
      where: { id: deliveryAddressId, customerId: customer.id },
    });
    if (!address) {
      throw new NotFoundException('delivery address not found');
    }

    const cart = await this.cartService.getOrCreateCart(customer.id);

    // Phase 1: validate, reserve, snapshot, and create the order rows, all
    // inside one transaction that starts by locking the cart row itself.
    //
    // Final review finding #5: the original code read cart_item OUTSIDE
    // any transaction, so a double-submitted checkout (double-tap, two
    // tabs) had both requests read the same lines before either took any
    // lock — both could pass validation and both create an order, a
    // second reservation, and a second Razorpay order from the same cart.
    // A paint-only cart had NO lock anywhere (the inventory FOR UPDATE
    // below only covers non-paint lines), so two such requests ran fully
    // in parallel. Locking the cart row first serializes the whole method
    // per cart: a second concurrent call blocks here until the first
    // commits (and has already deleted the cart_item rows) or rolls back
    // (and the rows are still there to re-validate).
    //
    // Final review finding #7: the Razorpay HTTP call used to run INSIDE
    // this transaction, while the inventory FOR UPDATE locks below were
    // still held and a pooled DB connection was checked out for the whole
    // round trip — the SDK sets no HTTP timeout, and this project's
    // connection pool defaults to 5. A slow Razorpay response under
    // concurrent checkouts on a popular listing could exhaust the pool and
    // stall every other request, including the webhook. createOrder now
    // runs in Phase 2, after this transaction has committed and released
    // every lock.
    const order = await this.sequelize.transaction(async (t) => {
      await this.sequelize.query(`SELECT id FROM cart WHERE id = :cartId FOR UPDATE`, {
        replacements: { cartId: cart.id },
        type: QueryTypes.SELECT,
        transaction: t,
      });

      // One query joins cart_item -> vendor_listing -> inventory -> vendors
      // -> master_product, reading everything checkout needs to validate
      // in one round trip (decision 0033's Consequences: "checkout
      // validation is a single query, not a loop"). Runs INSIDE the cart
      // lock, so this is current state, not a pre-lock snapshot.
      const lines = await this.sequelize.query<CartLineForCheckout>(
        `
        SELECT
          ci.id AS cart_item_id,
          ci.vendor_listing_id,
          vl.master_product_id,
          vl.vendor_id,
          ci.quantity,
          vl.price,
          vl.min_order_qty,
          vl.status AS listing_status,
          mp.sale_unit_type,
          u.is_active AS vendor_is_active,
          inv.quantity_available,
          inv.quantity_reserved
        FROM cart_item ci
        JOIN vendor_listing vl ON vl.id = ci.vendor_listing_id
        JOIN master_product mp ON mp.id = vl.master_product_id
        JOIN vendors v ON v.id = vl.vendor_id
        JOIN users u ON u.id = v.user_id
        LEFT JOIN inventory inv ON inv.vendor_listing_id = vl.id AND inv.warehouse_id IS NULL
        WHERE ci.cart_id = :cartId
        `,
        { replacements: { cartId: cart.id }, type: QueryTypes.SELECT, transaction: t },
      );

      if (lines.length === 0) {
        // Correct both for a genuinely empty cart, and for a
        // double-submit's second call: by the time it acquires the cart
        // lock, the first call has already committed and deleted every
        // cart_item row.
        throw new BadRequestException('cart is empty');
      }

      const rejections: CheckoutRejection[] = [];
      for (const line of lines) {
        if (line.listing_status !== VendorListingStatus.ACTIVE) {
          rejections.push({ vendorListingId: line.vendor_listing_id, reason: 'listing is not active' });
          continue;
        }
        if (!line.vendor_is_active) {
          rejections.push({ vendorListingId: line.vendor_listing_id, reason: 'vendor is paused' });
          continue;
        }
        const requested = Number(line.quantity);
        const isPaint = line.sale_unit_type === SaleUnitType.TINTED_TO_ORDER;
        if (isPaint) {
          // Final review finding #3: checkout treats every line
          // uniformly, snapshotting vendor_listing.price regardless of
          // which colour family was actually chosen — but a paint cart
          // line carries no colour/shade at all (cart_item and
          // order_items have no such column), and vendor_listing.price is
          // documented as the "untinted price" (vendor-listing.model.ts).
          // That means a paint order would be charged an arbitrary price
          // and recorded with no colour for the vendor to fulfil against.
          // Decision 0007's colour-family pricing was never wired into
          // the cart/checkout layer at all, in this plan or before it —
          // building that is new scope (a colour/shade selection UX and a
          // schema column), not a fix. Until it exists, refuse the line
          // explicitly rather than silently mis-price and mis-record it.
          rejections.push({
            vendorListingId: line.vendor_listing_id,
            reason: 'paint ordering is not yet supported — colour selection has no path to checkout',
          });
          continue;
        }
        if (line.quantity_available === null) {
          // No inventory row and not paint: stock was never set. Decision
          // 0032 rule 5's negative case.
          rejections.push({ vendorListingId: line.vendor_listing_id, reason: 'no stock on record' });
          continue;
        }
        const available = Number(line.quantity_available) - Number(line.quantity_reserved ?? 0);
        if (available < requested) {
          rejections.push({
            vendorListingId: line.vendor_listing_id,
            reason: `only ${available} available, ${requested} requested`,
          });
        }
      }

      // min_order_qty enforced per listing within each vendor group
      // (decision 0033 rule 3; min_order_qty is a per-listing column, not
      // a per-vendor minimum), against lines that passed the checks above
      // only.
      const byVendor = new Map<string, CartLineForCheckout[]>();
      for (const line of lines) {
        if (rejections.some((r) => r.vendorListingId === line.vendor_listing_id)) continue;
        const group = byVendor.get(line.vendor_id) ?? [];
        group.push(line);
        byVendor.set(line.vendor_id, group);
      }
      for (const [vendorId, groupLines] of byVendor) {
        for (const line of groupLines) {
          if (Number(line.quantity) < Number(line.min_order_qty)) {
            rejections.push({
              vendorListingId: line.vendor_listing_id,
              reason: `below minimum order quantity of ${line.min_order_qty} for vendor ${vendorId}`,
            });
          }
        }
      }

      if (rejections.length > 0) {
        // Matches this codebase's own convention for "reject naming the
        // offenders" (see StockService.setStock/bulkSetStock): the error
        // envelope (GlobalExceptionFilter) only carries a plain string
        // message, not a structured body — an object thrown here would
        // have any field besides `message`/`error` silently dropped.
        // Interpolate every offending line into one readable string
        // instead.
        const detail = rejections
          .map((r) => `listing ${r.vendorListingId}: ${r.reason}`)
          .join('; ');
        throw new BadRequestException(`checkout rejected — ${rejections.length} line(s): ${detail}`);
      }

      // Everything passed. SELECT ... FOR UPDATE re-reads and locks every
      // non-paint line's inventory row for the rest of this transaction,
      // so a second concurrent checkout touching the same row (from a
      // DIFFERENT cart — the cart lock above already serializes same-cart
      // double-submits) blocks until this one commits or rolls back, then
      // sees the now-current numbers. Confirmed live that without this
      // lock, two real concurrent connections both reading
      // quantity_available=1 can both proceed to reserve: a genuine
      // oversell, not a theoretical one.
      const stockLines = lines.filter((l) => l.sale_unit_type !== SaleUnitType.TINTED_TO_ORDER);
      const listingIds = stockLines.map((l) => l.vendor_listing_id);

      if (listingIds.length > 0) {
        // bind, NOT replacements — this codebase's own established fix
        // (see search-document.builder.ts's comment on the exact same
        // bug): replacements expands an array into comma-separated bare
        // text for an IN/ANY clause, so CAST(... AS uuid[]) fails with
        // "malformed array literal".
        const lockedRows = await this.sequelize.query<{
          vendor_listing_id: string;
          quantity_available: string;
          quantity_reserved: string;
        }>(
          `
          SELECT vendor_listing_id, quantity_available, quantity_reserved
          FROM inventory
          WHERE vendor_listing_id = ANY($1::uuid[]) AND warehouse_id IS NULL
          FOR UPDATE
          `,
          { bind: [listingIds], type: QueryTypes.SELECT, transaction: t },
        );
        const lockedByListing = new Map(lockedRows.map((r) => [r.vendor_listing_id, r]));

        const raceRejections: CheckoutRejection[] = [];
        for (const line of stockLines) {
          const locked = lockedByListing.get(line.vendor_listing_id);
          const available = locked
            ? Number(locked.quantity_available) - Number(locked.quantity_reserved)
            : 0;
          if (available < Number(line.quantity)) {
            raceRejections.push({
              vendorListingId: line.vendor_listing_id,
              reason: `only ${available} available, ${line.quantity} requested (stock changed since cart was validated)`,
            });
          }
        }
        if (raceRejections.length > 0) {
          const detail = raceRejections
            .map((r) => `listing ${r.vendorListingId}: ${r.reason}`)
            .join('; ');
          throw new BadRequestException(
            `checkout rejected — ${raceRejections.length} line(s): ${detail}`,
          );
        }

        // Single statement reserving every (non-paint) line at once, not a
        // loop, per decision 0033's Consequences ("a loop of N
        // reservations enqueues N reindex rows where one statement
        // enqueues one"). Safe: the FOR UPDATE lock above still holds
        // these rows for the rest of this transaction.
        const quantities = stockLines.map((l) => l.quantity);
        await this.sequelize.query(
          `
          UPDATE inventory i
          SET quantity_reserved = i.quantity_reserved + data.qty
          FROM (
            SELECT unnest(ARRAY[:listingIds]::uuid[]) AS listing_id,
                   unnest(ARRAY[:quantities]::decimal[]) AS qty
          ) AS data
          WHERE i.vendor_listing_id = data.listing_id AND i.warehouse_id IS NULL
          `,
          {
            replacements: { listingIds, quantities },
            type: QueryTypes.UPDATE,
            transaction: t,
          },
        );
      }

      const grandTotal = lines.reduce((sum, l) => sum + Number(l.price) * Number(l.quantity), 0);

      const createdOrder = await this.orderModel.create(
        {
          customerId: customer.id,
          deliveryAddressId: address.id,
          grandTotal,
          status: OrderStatus.PENDING_PAYMENT,
        } as any,
        { transaction: t },
      );

      for (const [vendorId, groupLines] of byVendor) {
        const subtotal = groupLines.reduce(
          (sum, l) => sum + Number(l.price) * Number(l.quantity),
          0,
        );
        const group = await this.groupModel.create(
          {
            orderId: createdOrder.id,
            vendorId,
            subtotal,
            status: OrderVendorGroupStatus.PENDING,
          } as any,
          { transaction: t },
        );
        for (const line of groupLines) {
          await this.itemModel.create(
            {
              orderVendorGroupId: group.id,
              vendorListingId: line.vendor_listing_id,
              masterProductId: line.master_product_id,
              quantity: line.quantity,
              unitPriceSnapshot: line.price,
            } as any,
            { transaction: t },
          );
        }
      }

      // Cart is cleared here, inside the same transaction as the
      // reservation and the order rows — if anything above this point
      // throws, the whole transaction rolls back and the cart is
      // untouched, matching decision 0033 rule 4's "leaves the database
      // exactly as it found it."
      await this.sequelize.query(`DELETE FROM cart_item WHERE cart_id = :cartId`, {
        replacements: { cartId: cart.id },
        type: QueryTypes.DELETE,
        transaction: t,
      });

      return createdOrder;
    });

    // Phase 2: create the Razorpay order, outside the transaction and its
    // locks (finding #7). If this fails, the reservation and order rows
    // from Phase 1 already committed — compensate by cancelling the order
    // and releasing the reservation, in a second, short transaction,
    // rather than leaving a razorpay_order_id-less order stuck
    // pending_payment forever with no way for the customer to pay it.
    try {
      const providerOrder = await this.paymentProvider.createOrder(
        Math.round(Number(order.grandTotal) * 100),
        order.id,
      );
      order.razorpayOrderId = providerOrder.providerOrderId;
      await order.save();
      return order;
    } catch (err) {
      this.logger.error(
        `order ${order.id}: Razorpay createOrder failed after reservation committed — releasing and cancelling: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await this.sequelize.transaction(async (t) => {
        const items = await this.sequelize.query<{ vendor_listing_id: string; quantity: string }>(
          `
          SELECT oi.vendor_listing_id, oi.quantity
          FROM order_items oi
          JOIN order_vendor_group ovg ON ovg.id = oi.order_vendor_group_id
          WHERE ovg.order_id = :orderId
          `,
          { replacements: { orderId: order.id }, type: QueryTypes.SELECT, transaction: t },
        );
        for (const item of items) {
          await this.sequelize.query(
            `
            UPDATE inventory
            SET quantity_reserved = quantity_reserved - :qty
            WHERE vendor_listing_id = :listingId AND warehouse_id IS NULL
            `,
            {
              replacements: { listingId: item.vendor_listing_id, qty: item.quantity },
              type: QueryTypes.UPDATE,
              transaction: t,
            },
          );
        }
        await this.sequelize.query(
          `UPDATE orders SET status = :cancelled WHERE id = :orderId AND status = :pending`,
          {
            replacements: {
              orderId: order.id,
              cancelled: OrderStatus.CANCELLED,
              pending: OrderStatus.PENDING_PAYMENT,
            },
            type: QueryTypes.UPDATE,
            transaction: t,
          },
        );
        await this.groupModel.update(
          { status: OrderVendorGroupStatus.CANCELLED },
          { where: { orderId: order.id, status: OrderVendorGroupStatus.PENDING }, transaction: t },
        );
      });
      throw err;
    }
  }
}
