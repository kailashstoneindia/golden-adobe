import { Model } from 'sequelize-typescript';

import { Attribute, AttributeDataType } from '../models/attribute.model';
import { Brand } from '../models/brand.model';
import { Category } from '../models/category.model';
import { MasterProduct, MasterProductStatus } from '../models/master-product.model';
import { MasterProductAttributeValue } from '../models/master-product-attribute-value.model';
import { MasterProductMedia, MediaType } from '../models/master-product-media.model';
import { VendorListing, VendorListingStatus } from '../models/vendor-listing.model';
import { Vendor } from '../../vendors/models/vendor.model';
import { User } from '../../users/models/user.model';

type AnyModel = { destroy(options: object): Promise<number> };

// Real rows for catalog integration specs (decision 0063 sessions). Every row
// is tracked and removed in reverse order by cleanup(), so a spec leaves the
// shared test database as it found it.
export function catalogFixtures(suffix: string) {
  const created: { model: AnyModel; id: string }[] = [];
  let n = 0;
  const next = () => (n += 1);
  const track = <T extends Model>(model: AnyModel, row: T) => {
    created.push({ model, id: row.get('id') as string });
    return row;
  };

  return {
    track,

    async category(label = 'Cat') {
      const i = next();
      return track(
        Category,
        await Category.create({
          name: `${label} ${i} ${suffix}`,
          slug: `fx-cat-${i}-${suffix}`,
          level: 1,
          path: `fx-cat-${i}-${suffix}`,
          isLeaf: true,
        } as never),
      );
    },

    async variantAttribute(categoryId: string, name: string) {
      const i = next();
      return track(
        Attribute,
        await Attribute.create({
          categoryId,
          code: `fx_attr_${i}_${suffix}`,
          name,
          dataType: AttributeDataType.TEXT,
          isVariantDefining: true,
        } as never),
      );
    },

    async brand(label = 'Brand', over: Record<string, unknown> = {}) {
      const i = next();
      return track(
        Brand,
        await Brand.create({
          name: `Fx${label}${i}${suffix}`,
          slug: `fx-${label.toLowerCase()}-${i}-${suffix}`,
          manufacturerName: 'Test',
          manufacturerAddress: 'Test',
          consumerCareEmail: 'care@test.com',
          consumerCarePhone: '+911234567890',
          ...over,
        } as never),
      );
    },

    async product(categoryId: string, over: Record<string, unknown> = {}) {
      const i = next();
      return track(
        MasterProduct,
        await MasterProduct.create({
          categoryId,
          name: `Fx Product ${i} ${suffix}`,
          slug: `fx-product-${i}-${suffix}`,
          isGeneric: true,
          status: MasterProductStatus.DRAFT,
          ...over,
        } as never),
      );
    },

    async attributeValue(productId: string, attributeId: string, value: string) {
      return track(
        MasterProductAttributeValue,
        await MasterProductAttributeValue.create({
          masterProductId: productId,
          attributeId,
          value,
        } as never),
      );
    },

    async image(productId: string, over: Record<string, unknown> = {}) {
      const i = next();
      return track(
        MasterProductMedia,
        await MasterProductMedia.create({
          masterProductId: productId,
          url: `https://cdn.test/fx-${i}-${suffix}.webp`,
          type: MediaType.IMAGE,
          isPrimary: true,
          ...over,
        } as never),
      );
    },

    async vendor() {
      const i = next();
      const user = track(
        User,
        await User.create({
          name: `Fx Vendor ${i} ${suffix}`,
          phone: `+91${String(Date.now() + i).slice(-10)}`,
          role: 'VENDOR',
          isApproved: true,
        } as never),
      );
      return track(
        Vendor,
        await Vendor.create({
          userId: user.id,
          shopName: `Fx Shop ${i} ${suffix}`,
          address: 'Test Address',
          latitude: 28.6,
          longitude: 77.2,
        } as never),
      );
    },

    async listing(
      vendorId: string,
      productId: string,
      status: VendorListingStatus = VendorListingStatus.ACTIVE,
    ) {
      return track(
        VendorListing,
        await VendorListing.create({
          vendorId,
          masterProductId: productId,
          price: 900,
          mrp: 1000,
          status,
        } as never),
      );
    },

    async cleanup() {
      for (const { model, id } of created.reverse()) {
        await model.destroy({ where: { id } }).catch(() => undefined);
      }
    },
  };
}
