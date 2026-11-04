'use strict';

// Decision 0055: admin approval now lands on PENDING_ARTISAN_RESPONSE and the
// ustaad accepts or declines; an unanswered request expires. Enum values are
// added outside a transaction (each statement autocommits) so the next
// migration's partial index can reference them.
const NEW_STATUSES = ['PENDING_ARTISAN_RESPONSE', 'ARTISAN_DECLINED', 'EXPIRED'];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    for (const status of NEW_STATUSES) {
      await queryInterface.sequelize.query(
        `ALTER TYPE "enum_artisan_hire_requests_status" ADD VALUE IF NOT EXISTS '${status}'`,
      );
    }
    await queryInterface.addColumn('artisan_hire_requests', 'artisan_responded_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('artisan_hire_requests', 'artisan_decline_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  // Postgres cannot drop an enum value without rebuilding the type. The values
  // stay behind, unused and harmless; the columns go.
  down: async (queryInterface) => {
    await queryInterface.removeColumn('artisan_hire_requests', 'artisan_responded_at');
    await queryInterface.removeColumn('artisan_hire_requests', 'artisan_decline_reason');
  },
};
