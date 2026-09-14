'use strict';

// The two leaf-only category attachment triggers deferred from Phase 1 (see
// the comment in 20260824090002-create-category.js). Both reference
// master_product, which now exists as of the previous migration in this
// batch. docs/catalog-schema.sql section 9a explains why TWO triggers are
// required rather than one FK-style guard.
//
// Wrapped in an explicit transaction — see the comment in
// 20260825090002-create-master-product.js. CREATE TRIGGER (unlike CREATE OR
// REPLACE FUNCTION) is not idempotent, so a partial failure here would
// otherwise leave one trigger installed and the retry failing on
// "trigger already exists".
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query(
        `CREATE OR REPLACE FUNCTION enforce_master_product_leaf_category()
         RETURNS TRIGGER AS $$
         DECLARE
           v_is_leaf BOOLEAN;
         BEGIN
           SELECT is_leaf INTO v_is_leaf FROM category WHERE id = NEW.category_id;

           IF v_is_leaf IS NULL THEN
             RAISE EXCEPTION 'category % does not exist', NEW.category_id;
           END IF;

           IF NOT v_is_leaf THEN
             RAISE EXCEPTION
               'master_product.category_id must reference a leaf category (% is not a leaf)',
               NEW.category_id;
           END IF;

           RETURN NEW;
         END;
         $$ LANGUAGE plpgsql;`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `CREATE TRIGGER trg_master_product_leaf_category
           BEFORE INSERT OR UPDATE OF category_id ON master_product
           FOR EACH ROW EXECUTE FUNCTION enforce_master_product_leaf_category();`,
        { transaction: t },
      );

      // The direction the FK used to cover: a leaf gaining a child would
      // silently orphan the products attached to it.
      await queryInterface.sequelize.query(
        `CREATE OR REPLACE FUNCTION enforce_category_leaf_transition()
         RETURNS TRIGGER AS $$
         DECLARE
           v_count INTEGER;
         BEGIN
           IF OLD.is_leaf AND NOT NEW.is_leaf THEN
             SELECT COUNT(*) INTO v_count FROM master_product WHERE category_id = NEW.id;
             IF v_count > 0 THEN
               RAISE EXCEPTION
                 'cannot add children to category % — % product(s) are attached to it; '
                 'move them to a leaf category first',
                 NEW.id, v_count;
             END IF;
           END IF;

           RETURN NEW;
         END;
         $$ LANGUAGE plpgsql;`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `CREATE TRIGGER trg_category_leaf_transition
           BEFORE UPDATE OF is_leaf ON category
           FOR EACH ROW EXECUTE FUNCTION enforce_category_leaf_transition();`,
        { transaction: t },
      );
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query(
        'DROP TRIGGER IF EXISTS trg_category_leaf_transition ON category;',
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        'DROP FUNCTION IF EXISTS enforce_category_leaf_transition();',
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        'DROP TRIGGER IF EXISTS trg_master_product_leaf_category ON master_product;',
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        'DROP FUNCTION IF EXISTS enforce_master_product_leaf_category();',
        { transaction: t },
      );
    });
  },
};
