'use strict';

// Decision 0063 (catalog onboarding): background import jobs with history,
// a log of brand/product merges, and the columns that let a merged brand or
// product point at the one it was merged into. Status and entity type are
// varchar + CHECK rather than Postgres enums so adding a value later is a
// one-line constraint swap, not an ALTER TYPE.
module.exports = {
  up: async (queryInterface) => {
    const q = (sql) => queryInterface.sequelize.query(sql);

    await q(`
      CREATE TABLE catalog_import_job (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id uuid NOT NULL REFERENCES category (id),
        created_by uuid NOT NULL REFERENCES users (id),
        file_key text NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'queued'
          CONSTRAINT catalog_import_job_status_check
          CHECK (status IN ('queued', 'running', 'done', 'failed')),
        total_rows integer NOT NULL DEFAULT 0,
        processed_rows integer NOT NULL DEFAULT 0,
        accepted_count integer NOT NULL DEFAULT 0,
        rejected_count integer NOT NULL DEFAULT 0,
        error_file_key text NULL,
        failure_message text NULL,
        undone_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz NULL
      )
    `);
    await q(
      'CREATE INDEX catalog_import_job_created_at_idx ON catalog_import_job (created_at DESC)',
    );

    await q(`
      CREATE TABLE catalog_merge_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type varchar(16) NOT NULL
          CONSTRAINT catalog_merge_log_entity_type_check
          CHECK (entity_type IN ('brand', 'product')),
        from_id uuid NOT NULL,
        into_id uuid NOT NULL,
        admin_user_id uuid NOT NULL REFERENCES users (id),
        summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q(
      'ALTER TABLE brand ADD COLUMN merged_into_id uuid NULL REFERENCES brand (id) ON DELETE SET NULL',
    );
    await q(`
      ALTER TABLE master_product
        ADD COLUMN merged_into_id uuid NULL REFERENCES master_product (id) ON DELETE SET NULL,
        ADD COLUMN merged_at timestamptz NULL,
        ADD COLUMN import_job_id uuid NULL REFERENCES catalog_import_job (id) ON DELETE SET NULL
    `);
    await q(
      'CREATE INDEX master_product_import_job_id_idx ON master_product (import_job_id) WHERE import_job_id IS NOT NULL',
    );
  },

  down: async (queryInterface) => {
    const q = (sql) => queryInterface.sequelize.query(sql);
    // import_job_id references catalog_import_job, so it goes before the table.
    await q('ALTER TABLE master_product DROP COLUMN IF EXISTS import_job_id');
    await q('DROP TABLE IF EXISTS catalog_merge_log');
    await q('DROP TABLE IF EXISTS catalog_import_job');
    await q(
      'ALTER TABLE master_product DROP COLUMN IF EXISTS merged_at, DROP COLUMN IF EXISTS merged_into_id',
    );
    await q('ALTER TABLE brand DROP COLUMN IF EXISTS merged_into_id');
  },
};
