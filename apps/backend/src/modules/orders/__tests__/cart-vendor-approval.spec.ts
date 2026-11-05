import { BadRequestException } from '@nestjs/common';

import { CartService } from '../../cart/cart.service';
import { createPaymentsTestApp, PaymentsTestApp } from './payments-test-app';

// Decision 0059 G5: an unapproved vendor's listing can't be put in a cart.
// Search already hides it; this covers a stale product screen.
describe('Adding an unapproved vendor’s listing to the cart', () => {
  let t: PaymentsTestApp;
  let cart: CartService;

  const setVendorApproved = (isApproved: boolean) =>
    t.query(`UPDATE users SET is_approved = :isApproved WHERE id = :id`, {
      isApproved,
      id: t.vendorUserId,
    });

  beforeAll(async () => {
    t = await createPaymentsTestApp();
    cart = t.moduleRef.get(CartService);
  });

  afterEach(async () => {
    await setVendorApproved(true);
  });

  afterAll(async () => {
    await t.close();
  });

  it('is refused with a message the customer can read, and the cart is unchanged', async () => {
    const { listingId } = await t.seedPendingOrder();
    await setVendorApproved(false);

    const attempt = cart.addItem(t.customerUserId, { vendorListingId: listingId, quantity: 1 });

    await expect(attempt).rejects.toThrow(BadRequestException);
    await expect(attempt).rejects.toThrow('This seller is not taking orders right now');
    const items = (await cart.getCartForUser(t.customerUserId)).items;
    expect(items.map((item) => item.vendorListingId)).not.toContain(listingId);
  });

  it('is accepted for an approved vendor', async () => {
    const { listingId } = await t.seedPendingOrder();

    const dto = await cart.addItem(t.customerUserId, { vendorListingId: listingId, quantity: 1 });

    expect(dto.items.map((item) => item.vendorListingId)).toContain(listingId);
  });
});
