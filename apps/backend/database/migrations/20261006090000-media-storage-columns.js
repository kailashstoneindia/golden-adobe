'use strict';

// Decision 0033. master_product_media was designed with only a `url`; storage
// backed rows also need the object key, what was uploaded, and where variant
// generation stands. Wrapped in an explicit transaction for the same reason as
// 20260825090004-create-master-product-media.js: sequelize-cli does not wrap
// up() in one, and a failure partway would leave a half-altered table.
//
// Rows with a NULL storage_key are external-URL rows (the table's original
// shape) and keep working; their processing_status defaults to 'ready' so
// nothing existing changes meaning.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      // The id is minted by the API at presign time, but inserts from SQL
      // (loaders, repairs) should not need to supply one.
      await run(`ALTER TABLE master_product_media ALTER COLUMN id SET DEFAULT gen_random_uuid();`);

      await run(`
        ALTER TABLE master_product_media
          ADD COLUMN storage_key       TEXT        NULL,
          ADD COLUMN content_type      TEXT        NULL,
          ADD COLUMN size_bytes        INTEGER     NULL,
          ADD COLUMN processing_status TEXT        NOT NULL DEFAULT 'ready',
          ADD COLUMN processing_error  TEXT        NULL,
          ADD COLUMN processed_at      TIMESTAMPTZ NULL,
          ADD CONSTRAINT chk_mpm_size_positive
            CHECK (size_bytes IS NULL OR size_bytes > 0),
          ADD CONSTRAINT chk_mpm_processing_status
            CHECK (processing_status IN ('processing', 'ready', 'failed'));
      `);

      // One object per row: a key can never be attached twice.
      await run(`
        CREATE UNIQUE INDEX idx_mpm_storage_key
          ON master_product_media (storage_key) WHERE storage_key IS NOT NULL;
      `);

      // The listing query (per product, in display order) had no index at all.
      await run(`
        CREATE INDEX idx_mpm_product_order
          ON master_product_media (master_product_id, display_order);
      `);
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      await run(`DROP INDEX IF EXISTS idx_mpm_product_order;`);
      await run(`DROP INDEX IF EXISTS idx_mpm_storage_key;`);
      await run(`
        ALTER TABLE master_product_media
          DROP CONSTRAINT IF EXISTS chk_mpm_processing_status,
          DROP CONSTRAINT IF EXISTS chk_mpm_size_positive,
          DROP COLUMN IF EXISTS processed_at,
          DROP COLUMN IF EXISTS processing_error,
          DROP COLUMN IF EXISTS processing_status,
          DROP COLUMN IF EXISTS size_bytes,
          DROP COLUMN IF EXISTS content_type,
          DROP COLUMN IF EXISTS storage_key;
      `);
      await run(`ALTER TABLE master_product_media ALTER COLUMN id DROP DEFAULT;`);
    });
  },
};
