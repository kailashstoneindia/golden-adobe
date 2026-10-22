import { Includeable } from 'sequelize';
import { CartItem } from './models/cart-item.model';
import { VendorListing } from '../catalog/models/vendor-listing.model';
import { Vendor } from '../vendors/models/vendor.model';
import { MasterProduct } from '../catalog/models/master-product.model';
import { Inventory } from '../catalog/models/inventory.model';

export const CART_DISPLAY_INCLUDE: Includeable[] = [
  {
    model: CartItem,
    include: [
      {
        model: VendorListing,
        include: [
          { model: Vendor, attributes: ['id', 'shopName', 'minOrderValue'] },
          { model: MasterProduct, attributes: ['id', 'name', 'productCode', 'saleUnitType'] },
          { model: Inventory, required: false, where: { warehouseId: null } },
        ],
      },
    ],
  },
];
