'use strict';

// Phase 7, risk 2 (catalog-integrity-residual-risks.md) — "a vendor can
// confirm a wrong match, permanently." The mechanism designed to prevent
// drift (vendor_product_map) is what cements the mistake if the vendor
// taps Confirm reflexively on a single yes/no button.
//
// Sketched fix: "show two or three candidates rather than one yes/no" +
// "surface DIFFERING attributes rather than just the product name." This
// column is where those runner-up candidates live between being computed
// (VendorMatchLadderService.matchStructured, which already scores every
// candidate and previously discarded everything but the winner) and being
// shown to the vendor. NULL/empty once resolved (confirm or reject clears
// it) — this is working data for one decision, not a permanent record.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('vendor_listing', 'match_candidates', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('vendor_listing', 'match_candidates');
  },
};
