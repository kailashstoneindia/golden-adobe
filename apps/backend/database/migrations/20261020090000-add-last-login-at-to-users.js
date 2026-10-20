'use strict';

// Client request (2026-10-18, see docs/decisions/0035 #3), built now under
// 0038's incremental-admin-delivery rule and designed in 0039.
//
// Nullable, no backfill: every existing user predates this column and has
// no historical login event to record. NULL means "never logged in since
// this column existed" — the admin UI shows this as "Never".
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'last_login_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'last_login_at');
  },
};
