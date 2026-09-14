'use strict';

// Decision 0019 gives vendor city two writers: automatic resolution from
// vendors.latitude/longitude, and an admin override. Without recording
// WHICH one set the current value, the two fight: a vendor editing their
// address would silently re-resolve the city and undo a correction an
// admin made deliberately, with no way to tell the cases apart after the
// fact.
//
// city_source is that record. 'gps' means auto-resolved and safe to
// re-resolve on the next address change; 'admin' means pinned and left
// alone until an admin clears it. NULL means no city has ever been set
// (the pre-backfill state), which re-resolves like 'gps'.
//
// A plain VARCHAR with a CHECK rather than a Postgres ENUM: this is a
// two-value operational flag, and adding a third value later to an enum
// type requires ALTER TYPE, while a CHECK is a constraint swap.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('vendors', 'city_source', {
      type: Sequelize.STRING(16),
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE vendors
        ADD CONSTRAINT vendors_city_source_check
        CHECK (city_source IS NULL OR city_source IN ('gps', 'admin'));
    `);

    // Existing rows all have city_id IS NULL (the column was added
    // nullable and nothing has ever written it — the very defect this
    // workstream closes), so there is no historical value to attribute.
    // Any row that somehow does carry a city predates the source concept;
    // mark it 'admin' so the backfill below cannot overwrite a value a
    // human may have set by hand.
    await queryInterface.sequelize.query(`
      UPDATE vendors SET city_source = 'admin' WHERE city_id IS NOT NULL;
    `);

    // Backfill: assign each city-less vendor the nearest ACTIVE city by
    // haversine distance to its centroid — the same formula
    // CityResolverService.resolveNearestCity() applies, expressed in SQL
    // so the migration needs no application code. 6371 = Earth radius km.
    //
    // Guarded on the city table having active rows: on a fresh database
    // this migration can run before any city is seeded, in which case
    // this is a no-op and vendors stay NULL until they next save an
    // address. That is the correct outcome, not a failure.
    await queryInterface.sequelize.query(`
      UPDATE vendors v
      SET city_id = nearest.city_id,
          city_source = 'gps'
      FROM (
        SELECT DISTINCT ON (ven.id)
               ven.id AS vendor_id,
               c.id   AS city_id
        FROM vendors ven
        CROSS JOIN city c
        WHERE ven.city_id IS NULL
          AND c.is_active = true
        ORDER BY ven.id,
                 6371 * 2 * asin(sqrt(
                   power(sin(radians(c.centroid_lat - ven.latitude) / 2), 2)
                   + cos(radians(ven.latitude))
                   * cos(radians(c.centroid_lat))
                   * power(sin(radians(c.centroid_lng - ven.longitude) / 2), 2)
                 )) ASC
      ) AS nearest
      WHERE v.id = nearest.vendor_id
        AND v.city_id IS NULL;
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_city_source_check;
    `);
    await queryInterface.removeColumn('vendors', 'city_source');
    // city_id itself is left populated: the backfilled values are correct
    // data, and this migration's own down() is not the place to discard
    // them. Reverting city_id belongs to 20260828090002's down().
  },
};
