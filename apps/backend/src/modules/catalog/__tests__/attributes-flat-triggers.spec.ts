import { TestingModule, Test } from '@nestjs/testing';
import { SequelizeModule, getConnectionToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

import { CATALOG_TEST_MODELS } from './test-db';
import { Category } from '../models/category.model';
import { Attribute, AttributeDataType } from '../models/attribute.model';
import { AttributeValueOption } from '../models/attribute-value-option.model';
import { MasterProduct, MasterProductStatus } from '../models/master-product.model';
import { MasterProductAttributeValue } from '../models/master-product-attribute-value.model';

// Integration tests for the DB trigger layer added in
// 20260826090000-create-attributes-flat-triggers.js — attributes_flat /
// identity_hash maintenance, enum-value validation, and the reindex queue.
// These triggers ARE the correctness guarantee (decisions 0005, 0013); a
// mocked test would prove nothing here, since the logic under test lives
// entirely in Postgres, not in TypeScript.
describe('attributes_flat / identity_hash triggers (integration)', () => {
  let moduleRef: TestingModule;
  let sequelize: Sequelize;
  const suffix = `t${Date.now()}`;

  let rootId: string;
  let branchId: string;
  let leafId: string;
  let sibling2Id: string; // a second leaf under the same branch, for the category-move test
  let globalAttrId: string;
  let currentAttrId: string;
  let curveAttrId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        SequelizeModule.forRoot({
          dialect: 'postgres',
          host: process.env.TEST_DB_HOST ?? '127.0.0.1',
          port: Number(process.env.TEST_DB_PORT ?? 5432),
          username: process.env.TEST_DB_USER ?? 'postgres',
          password: process.env.TEST_DB_PASS ?? 'postgres',
          database: process.env.TEST_DB_NAME ?? 'golden_abode_test',
          logging: false,
          models: CATALOG_TEST_MODELS,
        }),
      ],
    }).compile();
    sequelize = moduleRef.get<Sequelize>(getConnectionToken());

    const root = await Category.create({
      name: `TriggerRoot ${suffix}`,
      slug: `trigger-root-${suffix}`,
      level: 1,
      path: `trigger-root-${suffix}`,
      isLeaf: false,
    } as never);
    rootId = root.id;
    const branch = await Category.create({
      parentId: root.id,
      name: `TriggerBranch ${suffix}`,
      slug: `trigger-branch-${suffix}`,
      level: 2,
      path: `trigger-root-${suffix}/trigger-branch-${suffix}`,
      isLeaf: false,
    } as never);
    branchId = branch.id;
    const leaf = await Category.create({
      parentId: branch.id,
      name: `TriggerLeaf ${suffix}`,
      slug: `trigger-leaf-${suffix}`,
      level: 3,
      path: `trigger-root-${suffix}/trigger-branch-${suffix}/trigger-leaf-${suffix}`,
      isLeaf: true,
    } as never);
    leafId = leaf.id;
    const sibling2 = await Category.create({
      parentId: branch.id,
      name: `TriggerSibling2 ${suffix}`,
      slug: `trigger-sibling2-${suffix}`,
      level: 3,
      path: `trigger-root-${suffix}/trigger-branch-${suffix}/trigger-sibling2-${suffix}`,
      isLeaf: true,
    } as never);
    sibling2Id = sibling2.id;

    const globalAttr = await Attribute.create({
      categoryId: null,
      code: `cert_${suffix}`,
      name: 'Certification',
      dataType: AttributeDataType.ENUM,
      isSearchableFilter: true,
    } as never);
    globalAttrId = globalAttr.id;
    await AttributeValueOption.create({ attributeId: globalAttr.id, value: 'ISI' } as never);

    const currentAttr = await Attribute.create({
      categoryId: leafId,
      code: `current_${suffix}`,
      name: 'Rated Current',
      dataType: AttributeDataType.NUMBER,
      unit: 'A',
      isVariantDefining: true,
    } as never);
    currentAttrId = currentAttr.id;

    const curveAttr = await Attribute.create({
      categoryId: leafId,
      code: `curve_${suffix}`,
      name: 'Curve',
      dataType: AttributeDataType.ENUM,
      isVariantDefining: true,
    } as never);
    curveAttrId = curveAttr.id;
    await AttributeValueOption.create({ attributeId: curveAttr.id, value: 'C' } as never);
  });

  afterAll(async () => {
    await AttributeValueOption.destroy({
      where: { attributeId: [globalAttrId, currentAttrId, curveAttrId] },
    });
    await Attribute.destroy({ where: { id: [globalAttrId, currentAttrId, curveAttrId] } });
    // Leaves before branch before root — category.parent_id is
    // ON DELETE RESTRICT (docs/catalog-schema.sql section 3), so a parent
    // cannot be removed while any child row still references it.
    await Category.destroy({ where: { id: [leafId, sibling2Id] } });
    await Category.destroy({ where: { id: branchId } });
    await Category.destroy({ where: { id: rootId } });
    // Deleting globalAttrId above fires trg_attribute_enqueue_reindex,
    // which enqueues a scope='all' row — real, correct trigger behaviour
    // (a global attribute's removal affects every product), but it would
    // otherwise linger in the test DB forever since nothing else in this
    // suite drains the queue after this point. purge only removes rows
    // already marked processed, so drain must run first.
    await sequelize.query(`SELECT drain_catalog_reindex_queue()`);
    await sequelize.query(`SELECT purge_catalog_reindex_queue('0 seconds'::interval)`);
    await moduleRef.close();
  });

  it('populates attributes_flat and identity_hash when attribute values are inserted', async () => {
    // Created as DRAFT, not LIVE — Phase 7's
    // trg_mp_require_variant_attrs_on_publish trigger blocks a generic/
    // stone product transitioning to 'live' with any variant-defining
    // attribute still blank (both currentAttrId/curveAttrId are
    // variant-defining on this category), so attribute values must exist
    // BEFORE the transition, not after. This mirrors the real intended
    // workflow (draft -> fill attributes -> publish), not a shortcut the
    // old test setup used to take.
    const product = await MasterProduct.create({
      categoryId: leafId,
      name: `Trigger Product 1 ${suffix}`,
      slug: `trigger-product-1-${suffix}`,
      isGeneric: true,
      status: MasterProductStatus.DRAFT,
    } as never);

    await MasterProductAttributeValue.create({
      masterProductId: product.id,
      attributeId: currentAttrId,
      value: '32',
    } as never);
    await MasterProductAttributeValue.create({
      masterProductId: product.id,
      attributeId: curveAttrId,
      value: 'C',
    } as never);
    await MasterProductAttributeValue.create({
      masterProductId: product.id,
      attributeId: globalAttrId,
      value: 'ISI',
    } as never);
    await product.update({ status: MasterProductStatus.LIVE });

    const reloaded = await MasterProduct.findByPk(product.id);
    expect(reloaded!.attributesFlat).toEqual({
      [`current_${suffix}`]: '32',
      [`curve_${suffix}`]: 'C',
      [`cert_${suffix}`]: 'ISI',
    });
    expect(reloaded!.identityHash).not.toBeNull();

    await product.destroy();
  });

  it('rejects an enum value not in attribute_value_option', async () => {
    // draft — this test only exercises enum validation, unrelated to the
    // publish-time required-attrs guard, so there's no reason to clear
    // that bar here too.
    const product = await MasterProduct.create({
      categoryId: leafId,
      name: `Trigger Product 2 ${suffix}`,
      slug: `trigger-product-2-${suffix}`,
      isGeneric: true,
      status: MasterProductStatus.DRAFT,
    } as never);

    await expect(
      MasterProductAttributeValue.create({
        masterProductId: product.id,
        attributeId: curveAttrId,
        value: 'NotARealCurve',
      } as never),
    ).rejects.toThrow(/not an allowed option/);

    await product.destroy();
  });

  it('identity_hash normalises numeric values — "32" and "32.0" hash identically', async () => {
    // draft — identity_hash is computed regardless of publish status; this
    // test doesn't need to clear the publish-time required-attrs guard.
    const product = await MasterProduct.create({
      categoryId: leafId,
      name: `Trigger Product 3 ${suffix}`,
      slug: `trigger-product-3-${suffix}`,
      isGeneric: true,
      status: MasterProductStatus.DRAFT,
    } as never);

    await MasterProductAttributeValue.create({
      masterProductId: product.id,
      attributeId: currentAttrId,
      value: '32',
    } as never);
    const withInt = await MasterProduct.findByPk(product.id);
    const hashInt = withInt!.identityHash;

    await MasterProductAttributeValue.update(
      { value: '32.0' },
      { where: { masterProductId: product.id, attributeId: currentAttrId } },
    );
    const withDecimal = await MasterProduct.findByPk(product.id);
    expect(withDecimal!.identityHash).toBe(hashInt);

    await product.destroy();
  });

  it('deleting an attribute value removes it from attributes_flat', async () => {
    // draft — attributes_flat maintenance is unrelated to publish status.
    const product = await MasterProduct.create({
      categoryId: leafId,
      name: `Trigger Product 4 ${suffix}`,
      slug: `trigger-product-4-${suffix}`,
      isGeneric: true,
      status: MasterProductStatus.DRAFT,
    } as never);

    await MasterProductAttributeValue.create({
      masterProductId: product.id,
      attributeId: globalAttrId,
      value: 'ISI',
    } as never);
    await MasterProductAttributeValue.destroy({
      where: { masterProductId: product.id, attributeId: globalAttrId },
    });

    const reloaded = await MasterProduct.findByPk(product.id);
    expect(reloaded!.attributesFlat).not.toHaveProperty(`cert_${suffix}`);

    await product.destroy();
  });

  it('moving a product to a different leaf drops out-of-scope attributes, keeps global ones', async () => {
    // draft — category-move invalidation is unrelated to publish status.
    const product = await MasterProduct.create({
      categoryId: leafId,
      name: `Trigger Product 5 ${suffix}`,
      slug: `trigger-product-5-${suffix}`,
      isGeneric: true,
      status: MasterProductStatus.DRAFT,
    } as never);

    await MasterProductAttributeValue.create({
      masterProductId: product.id,
      attributeId: currentAttrId,
      value: '32',
    } as never);
    await MasterProductAttributeValue.create({
      masterProductId: product.id,
      attributeId: globalAttrId,
      value: 'ISI',
    } as never);

    // sibling2 shares the branch but does NOT declare current_${suffix} —
    // that attribute is scoped to leafId only.
    await MasterProduct.update({ categoryId: sibling2Id }, { where: { id: product.id } });

    const reloaded = await MasterProduct.findByPk(product.id);
    expect(reloaded!.attributesFlat).not.toHaveProperty(`current_${suffix}`);
    expect(reloaded!.attributesFlat).toHaveProperty(`cert_${suffix}`, 'ISI');

    await product.destroy();
  });

  it('a suppressed bulk write enqueues instead of rebuilding inline, and drain_catalog_reindex_queue rebuilds it', async () => {
    // draft — suppression/drain behaviour is unrelated to publish status.
    const product = await MasterProduct.create({
      categoryId: leafId,
      name: `Trigger Product 6 ${suffix}`,
      slug: `trigger-product-6-${suffix}`,
      isGeneric: true,
      status: MasterProductStatus.DRAFT,
    } as never);

    await sequelize.transaction(async (t) => {
      await sequelize.query(`SELECT set_config('catalog.suppress_flat_rebuild', 'on', true)`, {
        transaction: t,
      });
      await MasterProductAttributeValue.create(
        { masterProductId: product.id, attributeId: currentAttrId, value: '32' } as never,
        { transaction: t },
      );
    });

    const beforeDrain = await MasterProduct.findByPk(product.id);
    expect(beforeDrain!.attributesFlat).toEqual({});

    const pending = await sequelize.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM catalog_reindex_queue
         WHERE scope = 'product' AND master_product_id = :id AND processed_at IS NULL`,
      { replacements: { id: product.id }, type: QueryTypes.SELECT },
    );
    expect(Number(pending[0].count)).toBeGreaterThan(0);

    await sequelize.query(`SELECT drain_catalog_reindex_queue()`);

    const afterDrain = await MasterProduct.findByPk(product.id);
    expect(afterDrain!.attributesFlat).toEqual({ [`current_${suffix}`]: '32' });

    await product.destroy();
  });

  it('editing a global attribute enqueues scope=all; editing a leaf attribute enqueues scope=category_subtree', async () => {
    await Attribute.update({ name: 'Certification (renamed)' }, { where: { id: globalAttrId } });
    const allRows = await sequelize.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM catalog_reindex_queue WHERE scope = 'all' AND processed_at IS NULL`,
      { type: QueryTypes.SELECT },
    );
    expect(Number(allRows[0].count)).toBeGreaterThan(0);

    await Attribute.update({ name: 'Curve (renamed)' }, { where: { id: curveAttrId } });
    const subtreeRows = await sequelize.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM catalog_reindex_queue
         WHERE scope = 'category_subtree' AND category_id = :leafId AND processed_at IS NULL`,
      { replacements: { leafId }, type: QueryTypes.SELECT },
    );
    expect(Number(subtreeRows[0].count)).toBeGreaterThan(0);

    // Drain and purge so this suite doesn't leave a permanently-pending
    // backlog for other tests/environments sharing this DB.
    await sequelize.query(`SELECT drain_catalog_reindex_queue()`);
    await sequelize.query(`SELECT purge_catalog_reindex_queue('0 seconds'::interval)`);
  });
});
