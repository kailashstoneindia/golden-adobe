'use strict';

// Decision 0059 G1 (option A): search leaves out listings of a vendor whose
// account is not approved. Approval lives on users.is_approved, which the
// existing search triggers (vendor_listing, inventory, …) don't watch, so
// approving or rejecting a vendor must queue that vendor's products for
// re-indexing itself. A trigger catches every writer: the vendor approval
// endpoints, the generic users-page approve/reject, or a manual SQL fix.
//
// Row-level with a WHEN clause: it fires only when is_approved actually
// changes, and only queues products of a vendor row that user owns (an
// ustaad or customer has none, so their approval changes queue nothing).

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      await q(`
        CREATE OR REPLACE FUNCTION enqueue_search_outbox_for_vendor_approval()
        RETURNS TRIGGER AS $$
        BEGIN
          IF search_outbox_suppressed() THEN
            RETURN NULL;
          END IF;

          INSERT INTO search_outbox (entity_type, entity_id, city_id, reason)
          SELECT DISTINCT 'master_product', vl.master_product_id, v.city_id, 'vendor approval changed'
          FROM vendors v
          JOIN vendor_listing vl ON vl.vendor_id = v.id
          WHERE v.user_id = NEW.id;

          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await q(`
        CREATE TRIGGER trg_users_vendor_approval_search
        AFTER UPDATE OF is_approved ON users
        FOR EACH ROW
        WHEN (OLD.is_approved IS DISTINCT FROM NEW.is_approved)
        EXECUTE FUNCTION enqueue_search_outbox_for_vendor_approval();
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query(
        'DROP TRIGGER IF EXISTS trg_users_vendor_approval_search ON users;',
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        'DROP FUNCTION IF EXISTS enqueue_search_outbox_for_vendor_approval();',
        { transaction: t },
      );
    });
  },
};
