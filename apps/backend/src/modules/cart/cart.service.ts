import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Cart } from './models/cart.model';
import { CartItem } from './models/cart-item.model';
import { VendorListing } from '../catalog/models/vendor-listing.model';
import { CustomersService } from '../customers/customers.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart) private readonly cartModel: typeof Cart,
    @InjectModel(CartItem) private readonly cartItemModel: typeof CartItem,
    @InjectModel(VendorListing) private readonly vendorListingModel: typeof VendorListing,
    private readonly customersService: CustomersService,
  ) {}

  // Every cart is created lazily on first touch — there is no separate
  // "create my cart" endpoint, matching how a shopping cart is expected to
  // just exist the first time it's read or written to.
  async getOrCreateCart(customerId: string): Promise<Cart> {
    const [cart] = await this.cartModel.findOrCreate({ where: { customerId } });
    return cart;
  }

  // `findByPk` is typed `Model | null` by sequelize-typescript, but every
  // call site here re-reads a cart id this same method just confirmed
  // exists (via getOrCreateCart, or an update/delete that already 404'd on
  // a missing row) — the null case cannot occur on these paths, so a
  // not-null assertion documents that invariant instead of threading an
  // impossible-in-practice null through every return type.
  private async reloadCartWithItems(cartId: string): Promise<Cart> {
    return (await this.cartModel.findByPk(cartId, { include: [CartItem] }))!;
  }

  async getCartForUser(userId: string): Promise<Cart> {
    const customer = await this.customersService.resolveCustomerByUserId(userId);
    const cart = await this.getOrCreateCart(customer.id);
    return this.reloadCartWithItems(cart.id);
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<Cart> {
    const customer = await this.customersService.resolveCustomerByUserId(userId);
    const listing = await this.vendorListingModel.findByPk(dto.vendorListingId);
    if (!listing) {
      throw new NotFoundException('listing not found');
    }
    // Deliberately NOT checking stock or min_order_qty here (decision 0033:
    // "the cart is deliberately not self-healing" — checkout is the gate,
    // rule 4). The cart only confirms the listing exists.
    const cart = await this.getOrCreateCart(customer.id);
    const [item, created] = await this.cartItemModel.findOrCreate({
      where: { cartId: cart.id, vendorListingId: dto.vendorListingId },
      defaults: { quantity: dto.quantity } as CartItem,
    });
    if (!created) {
      item.quantity = Number(item.quantity) + dto.quantity;
      await item.save();
    }
    return this.reloadCartWithItems(cart.id);
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto): Promise<Cart> {
    const customer = await this.customersService.resolveCustomerByUserId(userId);
    const cart = await this.getOrCreateCart(customer.id);
    const item = await this.cartItemModel.findOne({ where: { id: itemId, cartId: cart.id } });
    if (!item) {
      throw new NotFoundException('cart item not found');
    }
    item.quantity = dto.quantity;
    await item.save();
    return this.reloadCartWithItems(cart.id);
  }

  async removeItem(userId: string, itemId: string): Promise<Cart> {
    const customer = await this.customersService.resolveCustomerByUserId(userId);
    const cart = await this.getOrCreateCart(customer.id);
    const deleted = await this.cartItemModel.destroy({ where: { id: itemId, cartId: cart.id } });
    if (deleted === 0) {
      throw new NotFoundException('cart item not found');
    }
    return this.reloadCartWithItems(cart.id);
  }
}
