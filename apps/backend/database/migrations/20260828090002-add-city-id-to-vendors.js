'use strict';

// Decision 0018 — "one vendor, one city, for now." A real migration on a
// table that already exists in production (unlike everything else in the
// catalog design, which has been docs-only up to this point) — see 0018
// consequences and catalog-build-order.md Phase 6a, "the new long pole."
//
// NULLABLE, deliberately: existing vendor rows have no city assigned yet.
// Making this NOT NULL immediately would break every current row. Backfill
// (from vendors.latitude/longitude via the same nearest-active-centroid
// logic city-resolver.service.ts uses, per 0018/0019) is an operational
// step for whoever runs this migration against a populated vendors table —
// not something this migration can do itself, since it runs before any
// city rows are guaranteed to exist in a fresh database, and choosing a
// city for an existing vendor is a data decision, not a schema one.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('vendors', 'city_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'city', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });

    await queryInterface.addIndex('vendors', ['city_id'], {
      name: 'idx_vendors_city',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('vendors', 'city_id');
  },
};
