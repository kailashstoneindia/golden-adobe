import { Includeable, WhereOptions } from 'sequelize';
import { Order } from './models/order.model';
import { OrderVendorGroup } from './models/order-vendor-group.model';
import { OrderItem } from './models/order-item.model';
import { CustomerAddress } from '../customers/models/customer-address.model';
import { Vendor } from '../vendors/models/vendor.model';
import { MasterProduct } from '../catalog/models/master-product.model';

const VENDOR_DISPLAY_INCLUDE: Includeable = {
  model: Vendor,
  attributes: ['id', 'shopName'],
};

const ORDER_ITEM_DISPLAY_INCLUDE: Includeable = {
  model: OrderItem,
  include: [{ model: MasterProduct, attributes: ['id', 'name', 'productCode'] }],
};

export const ORDER_GROUP_DISPLAY_INCLUDE: Includeable[] = [
  VENDOR_DISPLAY_INCLUDE,
  ORDER_ITEM_DISPLAY_INCLUDE,
];

export function customerOrderInclude(includeAddress: boolean): Includeable[] {
  const include: Includeable[] = [
    { model: OrderVendorGroup, include: ORDER_GROUP_DISPLAY_INCLUDE },
  ];
  if (includeAddress) {
    include.push({ model: CustomerAddress });
  }
  return include;
}

export function vendorGroupInclude(orderWhere: WhereOptions): Includeable[] {
  return [
    ...ORDER_GROUP_DISPLAY_INCLUDE,
    {
      model: Order,
      attributes: ['id', 'status'],
      where: orderWhere,
    },
  ];
}

export const ADMIN_ORDER_DISPLAY_INCLUDE: Includeable[] = [
  { model: CustomerAddress },
  { model: OrderVendorGroup, include: ORDER_GROUP_DISPLAY_INCLUDE },
];
