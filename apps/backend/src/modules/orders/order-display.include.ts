import { Includeable, WhereOptions } from 'sequelize';
import { Order } from './models/order.model';
import { OrderVendorGroup } from './models/order-vendor-group.model';
import { OrderItem } from './models/order-item.model';
import { CustomerAddress } from '../customers/models/customer-address.model';
import { Vendor } from '../vendors/models/vendor.model';
import { MasterProduct } from '../catalog/models/master-product.model';
import { Customer } from '../customers/models/customer.model';
import { User } from '../users/models/user.model';
import { ADMIN_CONTACT_ATTRIBUTES } from '../../common/mappers/admin-contact.mapper';

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

// Admin only (decision 0058 Task 4d): the customer's and each vendor's user
// account, for contact details. Attributes are listed so passwords and push
// tokens are never loaded.
// A NEW object per use: Sequelize writes the parent into include objects while
// it builds a query, so one shared object under both Customer and Vendor
// produces "missing FROM-clause entry for vendorGroups->vendor".
const adminUserInclude = (): Includeable => ({
  model: User,
  attributes: [...ADMIN_CONTACT_ATTRIBUTES],
});

export const ADMIN_ORDER_DISPLAY_INCLUDE: Includeable[] = [
  { model: CustomerAddress },
  { model: Customer, attributes: ['id', 'fullName'], include: [adminUserInclude()] },
  {
    model: OrderVendorGroup,
    include: [
      { model: Vendor, attributes: ['id', 'shopName', 'userId'], include: [adminUserInclude()] },
      ORDER_ITEM_DISPLAY_INCLUDE,
    ],
  },
];
