import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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

    // One query joins cart_item -> vendor_listing -> inventory -> vendors ->
    // master_product, reading everything checkout needs to validate in one
    // round trip. Matches decision 0033's Consequences: "checkout
    // validation is a single query, not a loop."
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
      { replacements: { cartId: cart.id }, type: QueryTypes.SELECT },
    );

    if (lines.length === 0) {
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
        // Decision 0032 rule 5 — paint has no inventory row by design;
        // ACTIVE status alone means available. Nothing more to check.
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

    // min_order_qty enforced per listing within each vendor group (decision
    // 0033 rule 3; min_order_qty is a per-listing column, not a per-vendor
    // minimum), against lines that passed the checks above only.
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
      // message, not a structured body — an object thrown here would have
      // any field besides `message`/`error` silently dropped. Interpolate
      // every offending line into one readable string instead.
      const detail = rejections
        .map((r) => `listing ${r.vendorListingId}: ${r.reason}`)
        .join('; ');
      throw new BadRequestException(`checkout rejected — ${rejections.length} line(s): ${detail}`);
    }

    // Everything passed. Reserve, snapshot, and create the order rows in
    // one transaction (decision 0033 rule 5: reservations across all
    // vendors succeed or fail together).
    return this.sequelize.transaction(async (t) => {
      // The validation above ran OUTSIDE this transaction, against a plain
      // SELECT with no lock — confirmed live (two real concurrent
      // connections both reading quantity_available=1, both proceeding to
      // reserve, final quantity_reserved=2 against quantity_available=1)
      // that without a lock here, two concurrent checkouts for the same
      // last unit can both pass validation and both reserve: a genuine
      // oversell, not a theoretical one. SELECT ... FOR UPDATE re-reads and
      // locks every non-paint line's inventory row for the rest of this
      // transaction, so a second concurrent checkout touching the same row
      // blocks until this one commits or rolls back, then sees the
      // now-current (post-reservation) numbers. Re-check availability
      // against this locked, fresh read — not the pre-transaction one —
      // and abort the whole checkout if anything changed, naming the
      // listing, exactly like the earlier rejection path.
      const stockLines = lines.filter((l) => l.sale_unit_type !== SaleUnitType.TINTED_TO_ORDER);
      const listingIds = stockLines.map((l) => l.vendor_listing_id);

      if (listingIds.length > 0) {
        // bind, NOT replacements — this codebase's own established fix
        // (see search-document.builder.ts's comment on the exact same
        // bug): replacements expands an array into comma-separated bare
        // text for an IN/ANY clause, so CAST(... AS uuid[]) fails with
        // "malformed array literal". Confirmed live: the first version of
        // this query used `:listingIds` via replacements and threw exactly
        // that error on both sides of the concurrent-checkout test below.
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
        // enqueues one"). Safe now: the FOR UPDATE lock above still holds
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

      const order = await this.orderModel.create(
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
            orderId: order.id,
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

      const providerOrder = await this.paymentProvider.createOrder(
        Math.round(grandTotal * 100),
        order.id,
      );
      order.razorpayOrderId = providerOrder.providerOrderId;
      await order.save({ transaction: t });

      // Cart is cleared only after everything else commits — if
      // createOrder throws, the whole transaction rolls back and the cart
      // is untouched, matching decision 0033 rule 4's "leaves the database
      // exactly as it found it" for ANY failure, not just the validation
      // ones above.
      await this.sequelize.query(`DELETE FROM cart_item WHERE cart_id = :cartId`, {
        replacements: { cartId: cart.id },
        type: QueryTypes.DELETE,
        transaction: t,
      });

      return order;
    });
  }
}
