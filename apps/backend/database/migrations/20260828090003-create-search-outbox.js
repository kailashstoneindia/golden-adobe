'use strict';

// The search sync outbox (docs/search-schema.sql section 1). Mirrors
// catalog_reindex_queue's shape — BIGSERIAL, enqueued_at/processed_at, a
// CHECK tying target to scope — but polymorphic on entity_id (no FK, no
// CASCADE) because there are several target entity types, not two. The
// worker must tolerate an entity_id that no longer exists — that turns out
// to be the delete path, not a defect (see search-schema.sql section 5).
//
// city_id is different: a real, foreign-keyed column, populated only when
// a trigger can name the specific city a change affects at trigger time
// (see the vendor_listing trigger function in the next migration for why
// that timing matters).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.createTable(
        'search_outbox',
        {
          id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
          },
          entity_type: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          entity_id: {
            type: Sequelize.UUID,
            allowNull: true, // NULL only for 'all'
          },
          city_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'city', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          reason: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          enqueued_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
          processed_at: {
            type: Sequelize.DATE,
            allowNull: true,
          },
        },
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE search_outbox
           ADD CONSTRAINT search_outbox_entity_type_check
           CHECK (entity_type IN (
             'master_product', 'brand', 'category', 'stone_variety', 'city', 'all'
           ));`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE search_outbox
           ADD CONSTRAINT search_outbox_target
           CHECK (
             (entity_type =  'all' AND entity_id IS NULL) OR
             (entity_type <> 'all' AND entity_id IS NOT NULL)
           );`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX idx_search_outbox_pending ON search_outbox (enqueued_at)
           WHERE processed_at IS NULL;`,
        { transaction: t },
      );

      // Bulk-write escape hatch, mirroring flat_rebuild_suppressed(). See
      // docs/search-schema.sql section 1 for the suppress/enqueue-'all'
      // pattern this supports.
      await queryInterface.sequelize.query(
        `CREATE OR REPLACE FUNCTION search_outbox_suppressed()
         RETURNS BOOLEAN AS $$
           SELECT COALESCE(current_setting('search.suppress_outbox', TRUE), 'off') = 'on';
         $$ LANGUAGE sql STABLE;`,
        { transaction: t },
      );
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.dropTable('search_outbox', { transaction: t });
      await queryInterface.sequelize.query(
        'DROP FUNCTION IF EXISTS search_outbox_suppressed();',
        { transaction: t },
      );
    });
  },
};
