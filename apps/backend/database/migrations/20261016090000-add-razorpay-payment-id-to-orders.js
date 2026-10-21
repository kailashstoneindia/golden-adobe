'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('orders', 'razorpay_payment_id', {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('orders', 'razorpay_payment_id');
  },
};
