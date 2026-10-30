'use strict';

// Lifecycle completion (decision 0045): artisan_hire_requests.status already
// supports IN_PROGRESS, COMPLETED, and CANCELLED, but nothing recorded *when*
// each of those transitions happened. These columns back the new
// start/complete/cancel transitions the same way admin_reviewed_at already
// backs the review transition — one nullable timestamp per transition, set
// exactly once, never updated afterwards. cancel_reason mirrors
// admin_reject_reason's existing log-and-display pattern rather than being a
// new concept.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('artisan_hire_requests', 'started_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('artisan_hire_requests', 'completed_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('artisan_hire_requests', 'cancelled_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('artisan_hire_requests', 'cancel_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('artisan_hire_requests', 'started_at');
    await queryInterface.removeColumn('artisan_hire_requests', 'completed_at');
    await queryInterface.removeColumn('artisan_hire_requests', 'cancelled_at');
    await queryInterface.removeColumn('artisan_hire_requests', 'cancel_reason');
  },
};
