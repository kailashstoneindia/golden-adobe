'use strict';

// Decision 0060: the delivery address is frozen at checkout so a later edit
// to the customer's saved address cannot redirect a paid-for delivery.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('orders', 'delivery_address_snapshot', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('orders', 'delivery_address_snapshot');
  },
};
