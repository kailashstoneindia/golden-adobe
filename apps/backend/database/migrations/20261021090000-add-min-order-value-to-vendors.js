'use strict';

// Client request (2026-10-21): checkout enforced vendor_listing.min_order_qty
// per line, a per-product minimum QUANTITY. Replaced with a per-vendor
// minimum order VALUE instead — a vendor's whole subtotal in a checkout must
// clear this amount, not any one line's quantity against a per-listing
// number. vendor_listing.min_order_qty itself is untouched: it still exists,
// still round-trips through the vendor Excel import/export template, and is
// simply no longer read by checkout (decision 0043).
//
// NULL means "no minimum set" — distinct from 0, and distinct from the
// `false`-like defensive-charge convention used for has_loading_unloading_team.
// A vendor with no minimum set is charged no minimum at all (checkout treats
// NULL as 0), not blocked, since forcing a minimum before the vendor sets one
// would silently reject every order from a vendor who never answered.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('vendors', 'min_order_value', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE vendors
        ADD CONSTRAINT vendors_min_order_value_check
        CHECK (min_order_value IS NULL OR min_order_value >= 0);
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE vendors
        DROP CONSTRAINT IF EXISTS vendors_min_order_value_check;
    `);
    await queryInterface.removeColumn('vendors', 'min_order_value');
  },
};
