'use strict';

// Decision 0054 rule 5: a refund can return at most what Razorpay actually
// captured. For a capture whose amount does not match the order (the
// refund_required path) that differs from grand_total, so the captured amount
// is recorded beside razorpay_payment_id. NULL for orders captured before this
// migration, where grand_total was verified equal at capture time.
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
