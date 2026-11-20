import { randomUUID } from 'crypto';
import { CheckoutService } from '../checkout.service';
import { buildAddressSnapshot } from '../delivery-address-snapshot';
import { CustomerAddress } from '../../customers/models/customer-address.model';
import { createPaymentsTestApp, PaymentsTestApp } from './payments-test-app';

describe('buildAddressSnapshot (decision 0060)', () => {
  it('copies the address fields and the recipient', () => {
    const address = {
      label: 'Home',
      addressLine1: '1 Test Street',
      addressLine2: 'Gate 2',
      city: 'Delhi',
      pincode: '110001',
      lat: '28.7041',
      lng: 77.1025,
    } as unknown as CustomerAddress;
    expect(buildAddressSnapshot(address, { name: 'Rina', phone: '9000000001' })).toEqual({
      label: 'Home',
      addressLine1: '1 Test Street',
      addressLine2: 'Gate 2',
      city: 'Delhi',
      pincode: '110001',
      lat: 28.7041,
      lng: 77.1025,
      recipientName: 'Rina',
      recipientPhone: '9000000001',
    });
  });
});

describe('checkout writes the address snapshot (decision 0060)', () => {
  let t: PaymentsTestApp;

  beforeAll(async () => {
    t = await createPaymentsTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('freezes the address and recipient on the order', async () => {
    const seeded = await t.seedPendingOrder();
    const [addr] = await t.query<{ id: string }>(
      `SELECT id FROM customer_addresses WHERE customer_id = :id LIMIT 1`,
      { id: t.customerId },
    );
    const [cart] = await t
      .query<{ id: string }>(`SELECT id FROM cart WHERE customer_id = :id`, {
        id: t.customerId,
      })
      .then(async (rows) =>
        rows.length
          ? rows
          : t.query<{ id: string }>(
              `INSERT INTO cart (id, customer_id) VALUES (gen_random_uuid(), :id) RETURNING id`,
              { id: t.customerId },
            ),
      );
    await t.query(
      `INSERT INTO cart_item (id, cart_id, vendor_listing_id, quantity)
       VALUES (:id, :cartId, :listingId, 1)`,
      { id: randomUUID(), cartId: cart.id, listingId: seeded.listingId },
    );

    const checkout = t.moduleRef.get(CheckoutService);
    const dto = await checkout.checkout(t.customerUserId, addr.id);

    const [row] = await t.query<{
      delivery_address_snapshot: Record<string, unknown>;
    }>(`SELECT delivery_address_snapshot FROM orders WHERE id = :id`, { id: dto.id });
    expect(row.delivery_address_snapshot).toMatchObject({
      addressLine1: '1 Test Street',
      city: 'Delhi',
      pincode: '110001',
      recipientName: 'Payments Test Customer',
    });
    expect(row.delivery_address_snapshot.recipientPhone).toEqual(expect.any(String));
  });
});
