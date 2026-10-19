'use strict';

// Ported from main (see docs/decisions/0036, and the main-branch PR
// "feat(vendors): loading/unloading capability field, category rename").
// Client request (2026-10-18): does a vendor have their own loading/
// unloading crew for heavy items, or does the platform need to arrange
// labor? Per-vendor fact the vendor supplies, not an admin judgment call,
// so a plain nullable boolean with no override column alongside it.
//
// NULL means "not asked yet / not answered" — distinct from `false`. This
// worktree's checkout.service.ts treats NULL the same as `false` (charge
// defensively until the vendor answers) — see that file's comment at the
// fee computation for the reasoning.
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
