'use strict';

// Phase 7, risk 3 (catalog-integrity-residual-risks.md) — the identity hash
// is built only from variant-defining attribute VALUES THAT ARE PRESENT.
// Omitting one produces a different hash, so "Black Galaxy / Polished /
// 18mm" and "Black Galaxy / Polished / (blank)" hash differently and both
// publish as if they were distinct products. This is the ONLY protection
// Stone and Hardware get — neither has reliable brand+MPN or GTIN — so a
// blank field silently defeats their entire duplicate-catalog defense.
//
// Scoped to identity-hash-dependent products only (is_generic = true, or
// stone_variety_id IS NOT NULL) — matching master_product_generic_identity's
// own WHERE clause exactly, not a category-name check, so this stays
// correct if the taxonomy under Hardware/Stone ever changes shape. Branded
// products already have brand+MPN/GTIN protection and are completely
// unaffected — a switch with no Series value can still publish.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      await q(`
        CREATE OR REPLACE FUNCTION enforce_required_variant_attrs_on_publish()
        RETURNS TRIGGER AS $$
        DECLARE
          v_missing TEXT;
        BEGIN
          -- Only fires on the transition INTO 'live' — a product can sit
          -- in draft/pending_review with blanks indefinitely; the guard is
          -- specifically at the point it becomes visible to customers.
          IF NEW.status <> 'live' OR (TG_OP = 'UPDATE' AND OLD.status = 'live') THEN
            RETURN NEW;
          END IF;

          -- Only identity-hash-dependent products — same scope as
          -- master_product_generic_identity.
          IF NOT (NEW.is_generic OR NEW.stone_variety_id IS NOT NULL) THEN
            RETURN NEW;
          END IF;

          -- Every variant-defining attribute declared on this product's
          -- own leaf category OR any ancestor (same inheritance resolution
          -- as build_attributes_flat) must have a value on this product.
          SELECT string_agg(a.code, ', ' ORDER BY a.code) INTO v_missing
          FROM (
            WITH RECURSIVE ancestry AS (
              SELECT id, parent_id FROM category WHERE id = NEW.category_id
              UNION ALL
              SELECT c.id, c.parent_id FROM category c JOIN ancestry anc ON c.id = anc.parent_id
            )
            SELECT a.code
            FROM attribute a
            WHERE a.is_variant_defining
              AND a.is_active
              AND a.category_id IN (SELECT id FROM ancestry)
              AND NOT EXISTS (
                SELECT 1 FROM master_product_attribute_value v
                WHERE v.master_product_id = NEW.id AND v.attribute_id = a.id
              )
          ) a;

          IF v_missing IS NOT NULL THEN
            RAISE EXCEPTION
              'cannot publish % — missing required variant-defining attribute(s) for an unbranded/stone product (identity_hash depends on these): %',
              NEW.id, v_missing;
          END IF;

          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await q(`
        CREATE TRIGGER trg_mp_require_variant_attrs_on_publish
          BEFORE INSERT OR UPDATE OF status ON master_product
          FOR EACH ROW EXECUTE FUNCTION enforce_required_variant_attrs_on_publish();
      `);
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
      await q(
        'DROP TRIGGER IF EXISTS trg_mp_require_variant_attrs_on_publish ON master_product;',
      );
      await q('DROP FUNCTION IF EXISTS enforce_required_variant_attrs_on_publish();');
    });
  },
};
