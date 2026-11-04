'use strict';

// Decision 0054 rule 5: a refund can return at most what Razorpay actually
// captured. For a capture whose amount does not match the order (the
// refund_required path) that differs from grand_total, so the captured amount
// is recorded beside razorpay_payment_id. NULL for orders captured before this
// migration: the amount was never checked then, so readers fall back to
// grand_total as the best available figure for those legacy rows.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('orders', 'captured_paise', {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('orders', 'captured_paise');
  },
};
