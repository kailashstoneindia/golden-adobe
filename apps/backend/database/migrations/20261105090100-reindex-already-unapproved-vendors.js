'use strict';

// Decision 0059 G1, deploy step. The trigger from 20261105090000 only reacts
// to approval CHANGES. Vendors who were already unapproved before it existed
// still have documents in the search index, so this queues their products
// once; the outbox drain then rebuilds or deletes those documents with the
// approval filter applied. Queuing an extra product is harmless (it is just
// rebuilt), so this needs no undo.

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO search_outbox (entity_type, entity_id, city_id, reason)
      SELECT DISTINCT 'master_product', vl.master_product_id, v.city_id, 'vendor approval backfill'
      FROM vendors v
      JOIN users u ON u.id = v.user_id AND NOT u.is_approved
      JOIN vendor_listing vl ON vl.vendor_id = v.id;
    `);
  },

  async down() {
    // Nothing to undo: queued rows are processed and kept as history.
  },
};
