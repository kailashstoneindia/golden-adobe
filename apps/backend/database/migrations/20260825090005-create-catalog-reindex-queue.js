'use strict';

// Invalidation source 3 for attributes_flat: an ATTRIBUTE row changed, which
// can invalidate tens of thousands of products beneath a category. That
// must not happen inline inside the admin's transaction, so it is enqueued
// here and drained by a background job. The enqueue trigger itself is added
// in the follow-up migration; this migration only creates the queue table
// so it exists before anything can reference it.
//
// Wrapped in an explicit transaction — see the comment in
// 20260825090002-create-master-product.js.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.createTable(
        'catalog_reindex_queue',
        {
          id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
          },
          scope: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          category_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'category', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          master_product_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'master_product', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
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
        `ALTER TABLE catalog_reindex_queue
           ADD CONSTRAINT catalog_reindex_queue_scope_check
           CHECK (scope IN ('all', 'category_subtree', 'product'));`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE catalog_reindex_queue
           ADD CONSTRAINT reindex_scope_target
           CHECK (
             (scope = 'all'              AND category_id IS NULL AND master_product_id IS NULL) OR
             (scope = 'category_subtree' AND category_id IS NOT NULL) OR
             (scope = 'product'          AND master_product_id IS NOT NULL)
           );`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX idx_reindex_pending ON catalog_reindex_queue (enqueued_at)
           WHERE processed_at IS NULL;`,
        { transaction: t },
      );
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('catalog_reindex_queue');
  },
};
