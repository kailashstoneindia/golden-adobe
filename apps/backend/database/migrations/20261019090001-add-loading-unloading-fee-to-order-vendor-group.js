'use strict';

// Decision 0036 (per-sqft addendum): a per-vendor-group charge for
// loading/unloading tiles and stone, applied at checkout when that
// vendor-group's vendor lacks their own crew (vendors.has_loading_
// unloading_team, added in 20261019090000). Computed as
// sum(line.quantity * loading_unloading_rate_per_sqft) across every
// tiles/stone line in the group — see checkout.service.ts.
//
// Default 0, not null: every existing order (none yet in this pre-launch
// schema, but the column itself should never be ambiguous) had no such
// charge, and 0 is the correct historical value, unlike vendors.
// has_loading_unloading_team's null-means-unknown, there is no "unknown
// fee" state — a group either owes this charge or it doesn't, and the
// checkout computation always sets it explicitly to either 0 or a
// positive amount.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('order_vendor_group', 'loading_unloading_fee', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE order_vendor_group
        ADD CONSTRAINT ovg_loading_unloading_fee_check
        CHECK (loading_unloading_fee >= 0);
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE order_vendor_group
        DROP CONSTRAINT IF EXISTS ovg_loading_unloading_fee_check;
    `);
    await queryInterface.removeColumn('order_vendor_group', 'loading_unloading_fee');
  },
};
