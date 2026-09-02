import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Category } from './models/category.model';
import { Attribute } from './models/attribute.model';
import { AttributeValueOption } from './models/attribute-value-option.model';

export type ResolvedAttributeBlock = {
  // 'global' | 'leaf' | a non-leaf ancestor's own id — used only to label
  // which block a column came from when building the template; never
  // persisted anywhere.
  source: 'global' | 'ancestor' | 'leaf';
  sourceCategoryId: string | null; // null for 'global'
  attributes: Attribute[];
};

// Resolves the EFFECTIVE attribute set for a leaf category: global
// attributes, then every ancestor's own attributes (outermost first), then
// the leaf's own — exactly the column layering catalog-excel-flows.md Flow 1
// specifies, and the same inheritance rule build_attributes_flat() encodes
// in SQL for products that already exist.
//
// This is a DELIBERATE TypeScript reimplementation, not a call into the DB
// function: build_attributes_flat(p_master_product_id UUID) takes an
// EXISTING product's id and reads its category via master_product. Template
// generation runs before any product exists for a given upload, so there is
// no product row to hand it — the resolution has to start from category_id
// directly. Keep the two in sync by hand if the inheritance rule ever
// changes; there is no way to share the SQL across both call sites as
// written.
@Injectable()
export class CatalogAttributeResolverService {
  constructor(
    @InjectModel(Category)
    private readonly categoryModel: typeof Category,
    @InjectModel(Attribute)
    private readonly attributeModel: typeof Attribute,
  ) {}

  /**
   * Returns the leaf category's full ancestry, root first, leaf last —
   * e.g. [Electrical, Switchgear, MCB] for electrical/switchgear/mcb.
   * Throws NotFoundException if the category doesn't exist, and throws a
   * plain Error if it isn't a leaf (mirrors the DB's leaf-only invariant —
   * a template only ever makes sense for a leaf, since only leaves accept
   * products).
   */
  async resolveAncestry(leafCategoryId: string): Promise<Category[]> {
    const leaf = await this.categoryModel.findByPk(leafCategoryId);
    if (!leaf) {
      throw new NotFoundException(`category ${leafCategoryId} does not exist`);
    }
    if (!leaf.isLeaf) {
      throw new Error(
        `category ${leafCategoryId} (${leaf.path}) is not a leaf — templates are generated for leaf categories only`,
      );
    }

    const chain: Category[] = [leaf];
    let current = leaf;
    while (current.parentId) {
      const parent = await this.categoryModel.findByPk(current.parentId);
      if (!parent) {
        // Data integrity issue, not a user error — parent_id is an FK with
        // ON DELETE RESTRICT, so this should be unreachable in practice.
        throw new Error(`category ${current.id} references missing parent ${current.parentId}`);
      }
      chain.unshift(parent);
      current = parent;
    }
    return chain;
  }

  /**
   * The effective attribute set for a leaf category, grouped into blocks in
   * template column order: global, then each ancestor outermost-first, then
   * the leaf's own. Only active attributes on active categories in the
   * chain — deactivated attributes never appear in a freshly generated
   * template, matching build_attributes_flat()'s filter.
   */
  async resolveEffectiveAttributes(leafCategoryId: string): Promise<ResolvedAttributeBlock[]> {
    const ancestry = await this.resolveAncestry(leafCategoryId);
    const leaf = ancestry[ancestry.length - 1];

    const globalAttributes = await this.attributeModel.findAll({
      where: { categoryId: null, isActive: true },
      include: [AttributeValueOption],
      order: [['displayOrder', 'ASC']],
    });

    const blocks: ResolvedAttributeBlock[] = [
      { source: 'global', sourceCategoryId: null, attributes: globalAttributes },
    ];

    // Ancestors, outermost first — ancestry is [root, ..., leaf], so
    // everything except the last entry, in the order it's already in.
    for (const ancestor of ancestry.slice(0, -1)) {
      const attrs = await this.attributeModel.findAll({
        where: { categoryId: ancestor.id, isActive: true },
        include: [AttributeValueOption],
        order: [['displayOrder', 'ASC']],
      });
      if (attrs.length > 0) {
        blocks.push({ source: 'ancestor', sourceCategoryId: ancestor.id, attributes: attrs });
      }
    }

    const leafAttributes = await this.attributeModel.findAll({
      where: { categoryId: leaf.id, isActive: true },
      include: [AttributeValueOption],
      order: [['displayOrder', 'ASC']],
    });
    if (leafAttributes.length > 0) {
      blocks.push({ source: 'leaf', sourceCategoryId: leaf.id, attributes: leafAttributes });
    }

    return blocks;
  }
}
