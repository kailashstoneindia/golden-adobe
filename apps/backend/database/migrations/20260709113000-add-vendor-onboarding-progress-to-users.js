'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'onboarding_completed', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn('users', 'onboarding_completed_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('users', 'onboarding_stage', {
      type: Sequelize.ENUM('BASIC_DETAILS', 'SHOP_DETAILS', 'BANK_DETAILS', 'COMPLETED'),
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'onboarding_stage');
    await queryInterface.removeColumn('users', 'onboarding_completed_at');
    await queryInterface.removeColumn('users', 'onboarding_completed');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_onboarding_stage";');
  },
};
