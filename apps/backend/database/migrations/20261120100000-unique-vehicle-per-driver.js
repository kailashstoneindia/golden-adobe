'use strict';

// Review of PR #45: "one vehicle per driver" was only a check-then-write in the
// service, so two admins racing could both pass it. The database is the backstop.
// A partial index, because many drivers may have no vehicle (NULL).
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX drivers_vehicle_id_key ON drivers (vehicle_id) WHERE vehicle_id IS NOT NULL',
    );
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS drivers_vehicle_id_key');
  },
};
