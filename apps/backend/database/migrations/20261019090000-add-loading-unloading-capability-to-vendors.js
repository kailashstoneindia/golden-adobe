'use strict';

// Client request (2026-10-18, see docs/decisions/0035 and 0036): does a
// vendor have their own loading/unloading crew for heavy items, or does the
// platform need to arrange labor? This is a per-vendor fact the vendor
// supplies (bio/capability-style, not an admin judgment call like
// vendors.city_source), so it is a plain nullable boolean with no admin
// override column alongside it.
//
// NULL means "not asked yet / not answered" — distinct from `false`. Every
// vendor onboarded before this migration lands in that state and needs
// either a future onboarding prompt or an admin backfill before the
// eventual checkout charge (0036) can correctly apply to their listings.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('vendors', 'has_loading_unloading_team', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('vendors', 'has_loading_unloading_team');
  },
};
