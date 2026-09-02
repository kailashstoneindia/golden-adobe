import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';

import { MasterProduct, MasterProductStatus } from './models/master-product.model';
import { ListProductsQueryDto } from './dto/list-products-query.dto';

// Backing service for the admin panel's catalog screens (browse, inspect,
// publish). Reads Postgres directly rather than the search index, because
// admin's whole job here includes DRAFT products — which have no vendor
// listing, therefore no search document, therefore no Meilisearch
// representation at all (decision 0019).

export type CategoryNode = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  path: string;
  level: number;
  isLeaf: boolean;
  unitOfMeasure: string | null;
  productCount: number;
  children: CategoryNode[];
};

@Injectable()
export class AdminCatalogService {
  constructor(
    @InjectModel(MasterProduct)
    private readonly masterProductModel: typeof MasterProduct,
  ) {}

  private get sequelize() {
    return this.masterProductModel.sequelize!;
  }

  // The whole tree in one query, assembled in memory. 71 nodes — a recursive
  // fetch per level would be needless round trips at this size.
  async listCategoryTree(): Promise<CategoryNode[]> {
    const rows = await this.sequelize.query<{
      id: string;
      parent_id: string | null;
      name: string;
      slug: string;
      path: string;
      level: number;
      is_leaf: boolean;
      uom: string | null;
      product_count: string;
    }>(
      `SELECT
         c.id, c.parent_id, c.name, c.slug, c.path, c.level, c.is_leaf,
         u.code AS uom,
         (SELECT COUNT(*) FROM master_product mp WHERE mp.category_id = c.id) AS product_count
       FROM category c
       LEFT JOIN unit_of_measure u ON u.id = c.unit_of_measure_default_id
       WHERE c.is_active
       ORDER BY c.level, c.display_order, c.name`,
      { type: QueryTypes.SELECT },
    );

    const byId = new Map<string, CategoryNode>();
    const roots: CategoryNode[] = [];

    for (const row of rows) {
      byId.set(row.id, {
        id: row.id,
        parentId: row.parent_id,
        name: row.name,
        slug: row.slug,
        path: row.path,
        level: row.level,
        isLeaf: row.is_leaf,
        unitOfMeasure: row.uom,
        productCount: Number(row.product_count),
        children: [],
      });
    }

    // Ordered by level, so a parent is always in the map before its children.
    for (const row of rows) {
      const node = byId.get(row.id)!;
      if (row.parent_id) byId.get(row.parent_id)?.children.push(node);
      else roots.push(node);
    }

    return roots;
  }

  // Global + inherited + own, in the order a template would present them.
  // This is the same resolution the import template generator performs, so an
  // admin can see what a category's template will contain before downloading.
  async listCategoryAttributes(categoryId: string) {
    const [category] = await this.sequelize.query<{ id: string; path: string; name: string }>(
      `SELECT id, path, name FROM category WHERE id = :categoryId`,
      { type: QueryTypes.SELECT, replacements: { categoryId } },
    );
    if (!category) throw new NotFoundException('Category not found');

    const attributes = await this.sequelize.query<{
      id: string;
      code: string;
      name: string;
      data_type: string;
      unit: string | null;
      is_variant_defining: boolean;
      is_searchable_filter: boolean;
      declared_on: string | null;
      scope: string;
      options: string[] | null;
    }>(
      `WITH RECURSIVE ancestry AS (
         SELECT id, parent_id, path, level FROM category WHERE id = :categoryId
         UNION ALL
         SELECT c.id, c.parent_id, c.path, c.level
         FROM category c JOIN ancestry a ON c.id = a.parent_id
       )
       SELECT
         a.id, a.code, a.name, a.data_type::text AS data_type, a.unit,
         a.is_variant_defining, a.is_searchable_filter,
         anc.path AS declared_on,
         CASE
           WHEN a.category_id IS NULL      THEN 'global'
           WHEN a.category_id = :categoryId THEN 'own'
           ELSE 'inherited'
         END AS scope,
         (SELECT ARRAY_AGG(o.value ORDER BY o.display_order)
            FROM attribute_value_option o WHERE o.attribute_id = a.id) AS options
       FROM attribute a
       LEFT JOIN ancestry anc ON anc.id = a.category_id
       WHERE a.is_active
         AND (a.category_id IS NULL OR a.category_id IN (SELECT id FROM ancestry))
       ORDER BY
         CASE WHEN a.category_id = :categoryId THEN 0
              WHEN a.category_id IS NULL THEN 2
              ELSE 1 END,
         a.display_order, a.name`,
      { type: QueryTypes.SELECT, replacements: { categoryId } },
    );

    return {
      category,
      attributes: attributes.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        dataType: a.data_type,
        unit: a.unit,
        isVariantDefining: a.is_variant_defining,
        isSearchableFilter: a.is_searchable_filter,
        scope: a.scope as 'own' | 'inherited' | 'global',
        declaredOn: a.declared_on,
        options: a.options ?? [],
      })),
    };
  }

  async listProducts(query: ListProductsQueryDto) {
    const limit = Math.min(query.limit ?? 25, 100);
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const where: string[] = ['1 = 1'];
    const replacements: Record<string, unknown> = { limit, offset };

    if (query.search) {
      // word_similarity, not similarity — a keyword against a full product
      // name scores near zero under similarity() because it penalises length
      // difference. Product code is matched exactly: an admin pasting
      // "GA-0000123" wants that row, not a fuzzy neighbour.
      where.push(
        `(word_similarity(:search, mp.name) >= 0.5 OR mp.product_code = :search
          OR mp.mfr_part_number = :search OR mp.gtin = :search)`,
      );
      replacements.search = query.search;
    }
    if (query.categoryId) {
      // Subtree match, so picking a top-level category shows everything under it.
      where.push(
        `mp.category_id IN (
           SELECT d.id FROM category c JOIN category d
             ON d.id = c.id OR d.path LIKE c.path || '/%'
           WHERE c.id = :categoryId
         )`,
      );
      replacements.categoryId = query.categoryId;
    }
    if (query.status) {
      where.push(`mp.status = CAST(:status AS master_product_status)`);
      replacements.status = query.status;
    }

    const whereSql = where.join(' AND ');

    const rows = await this.sequelize.query<{
      id: string;
      product_code: string;
      name: string;
      status: string;
      category_path: string;
      brand: string | null;
      listing_count: string;
      updated_at: Date;
    }>(
      `SELECT
         mp.id, mp.product_code, mp.name, mp.status::text AS status,
         cat.path AS category_path, b.name AS brand, mp.updated_at,
         (SELECT COUNT(*) FROM vendor_listing vl
           WHERE vl.master_product_id = mp.id AND vl.status = 'active') AS listing_count
       FROM master_product mp
       JOIN category cat ON cat.id = mp.category_id
       LEFT JOIN brand b ON b.id = mp.brand_id
       WHERE ${whereSql}
       ORDER BY ${query.search ? 'word_similarity(:search, mp.name) DESC,' : ''} mp.updated_at DESC
       LIMIT :limit OFFSET :offset`,
      { type: QueryTypes.SELECT, replacements },
    );

    const [{ total }] = await this.sequelize.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM master_product mp WHERE ${whereSql}`,
      { type: QueryTypes.SELECT, replacements },
    );

    return {
      items: rows.map((r) => ({
        id: r.id,
        productCode: r.product_code,
        name: r.name,
        status: r.status,
        categoryPath: r.category_path,
        brand: r.brand,
        listingCount: Number(r.listing_count),
        updatedAt: r.updated_at.toISOString(),
      })),
      total: Number(total),
      page,
      limit,
    };
  }

  async getProduct(productId: string) {
    const [product] = await this.sequelize.query<{
      id: string;
      product_code: string;
      name: string;
      slug: string;
      status: string;
      category_id: string;
      category_path: string;
      brand: string | null;
      mfr_part_number: string | null;
      gtin: string | null;
      hsn_code: string | null;
      gst_rate: string;
      country_of_origin: string;
      is_generic: boolean;
      attributes_flat: Record<string, unknown>;
      listing_count: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT
         mp.id, mp.product_code, mp.name, mp.slug, mp.status::text AS status,
         mp.category_id, cat.path AS category_path, b.name AS brand,
         mp.mfr_part_number, mp.gtin, mp.hsn_code, mp.gst_rate,
         mp.country_of_origin, mp.is_generic, mp.attributes_flat,
         mp.created_at, mp.updated_at,
         (SELECT COUNT(*) FROM vendor_listing vl
           WHERE vl.master_product_id = mp.id AND vl.status = 'active') AS listing_count
       FROM master_product mp
       JOIN category cat ON cat.id = mp.category_id
       LEFT JOIN brand b ON b.id = mp.brand_id
       WHERE mp.id = :productId`,
      { type: QueryTypes.SELECT, replacements: { productId } },
    );
    if (!product) throw new NotFoundException('Product not found');

    const values = await this.sequelize.query<{
      code: string;
      name: string;
      unit: string | null;
      value: string;
      is_variant_defining: boolean;
    }>(
      `SELECT a.code, a.name, a.unit, v.value, a.is_variant_defining
       FROM master_product_attribute_value v
       JOIN attribute a ON a.id = v.attribute_id
       WHERE v.master_product_id = :productId
       ORDER BY a.is_variant_defining DESC, a.display_order, a.name`,
      { type: QueryTypes.SELECT, replacements: { productId } },
    );

    return {
      id: product.id,
      productCode: product.product_code,
      name: product.name,
      slug: product.slug,
      status: product.status,
      categoryId: product.category_id,
      categoryPath: product.category_path,
      brand: product.brand,
      mfrPartNumber: product.mfr_part_number,
      gtin: product.gtin,
      hsnCode: product.hsn_code,
      gstRate: Number(product.gst_rate),
      countryOfOrigin: product.country_of_origin,
      isGeneric: product.is_generic,
      attributesFlat: product.attributes_flat ?? {},
      listingCount: Number(product.listing_count),
      createdAt: product.created_at.toISOString(),
      updatedAt: product.updated_at.toISOString(),
      attributeValues: values.map((v) => ({
        code: v.code,
        name: v.name,
        unit: v.unit,
        value: v.value,
        isVariantDefining: v.is_variant_defining,
      })),
    };
  }

  async setProductStatus(productId: string, status: 'live' | 'draft') {
    const product = await this.masterProductModel.findByPk(productId);
    if (!product) throw new NotFoundException('Product not found');

    try {
      await product.update({
        status: status === 'live' ? MasterProductStatus.LIVE : MasterProductStatus.DRAFT,
      });
    } catch (err) {
      // The required-variant-attributes trigger (Phase 7 risk 3) raises a
      // plain SQL exception naming the missing attributes. Surfacing its
      // message is far more useful to an admin than a generic 500 — it tells
      // them exactly which field to fill in.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('variant-defining') || message.includes('variant_defining')) {
        throw new BadRequestException(message.replace(/^.*?ERROR:\s*/i, ''));
      }
      throw err;
    }

    return this.getProduct(productId);
  }
}
