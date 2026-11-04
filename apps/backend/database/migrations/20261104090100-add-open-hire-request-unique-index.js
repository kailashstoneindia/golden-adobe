'use strict';

// Decision 0055: a customer may have open requests with many ustaads at once,
// but only one open request with the same ustaad. The partial unique index
// closes the race two concurrent createRequest calls would otherwise win
// together; the service's own check gives the friendly 409.
//
// Fails to build if prod already holds two open requests for the same pair —
// check before deploying.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "artisan_hire_requests_one_open_per_pair"
      ON "artisan_hire_requests" ("customer_id", "artisan_id")
      WHERE "status" IN (
        'PENDING_ADMIN_REVIEW',
        'PENDING_ARTISAN_RESPONSE',
        'ACCEPTED_BY_ARTISAN',
        'IN_PROGRESS'
      )
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS "artisan_hire_requests_one_open_per_pair"',
    );
  },
};
