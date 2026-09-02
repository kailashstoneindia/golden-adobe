'use strict';

// Geography (decision 0018) — the business connects customers to LOCAL
// vendors; every search is scoped to exactly one city, never cross-city.
// Admin-curated, not user-generated or inferred — launching a city is a
// business decision.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.createTable(
        'city',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          name: {
            type: Sequelize.STRING(64),
            allowNull: false,
          },
          slug: {
            type: Sequelize.STRING(80),
            allowNull: false,
            unique: true,
          },
          // Disambiguates same-named cities across states — decision 0020
          // is the first real use of this (Delhi/Haryana/UP all in NCR).
          state: {
            type: Sequelize.STRING(64),
            allowNull: false,
          },
          // Centroid for the GPS resolution path — a city, not a precise
          // boundary. Nearest-active-centroid by haversine distance, not
          // reverse-geocoding, to avoid a third-party API dependency
          // (decision 0018).
          centroid_lat: {
            type: Sequelize.DECIMAL(9, 6),
            allowNull: false,
          },
          centroid_lng: {
            type: Sequelize.DECIMAL(9, 6),
            allowNull: false,
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction: t },
      );

      await queryInterface.addConstraint('city', {
        fields: ['name', 'state'],
        type: 'unique',
        name: 'city_name_unique_per_state',
        transaction: t,
      });

      await queryInterface.sequelize.query(
        `CREATE INDEX idx_city_active ON city (is_active);`,
        { transaction: t },
      );
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('city');
  },
};
