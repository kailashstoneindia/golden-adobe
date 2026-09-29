'use strict';

// Phase 7, risk 1 (catalog-integrity-residual-risks.md) — duplicate brand
// rows defeat UNIQUE (brand_id, mfr_part_number) silently: "Havells" and
// "Havells India" get different brand_id values, so the SAME MPN under
// each publishes cleanly as two "different" products. No error, no
// constraint violation, nothing looks wrong — the failure only surfaces
// when a customer sees two identical MCBs at different prices.
//
// Two independent defenses, per the sketched fixes:
//   1. A unique index on a NORMALISED brand name — catches near-identical
//      CANONICAL brand rows (case, whitespace, common corporate suffixes).
//   2. brand_alias, symmetric with stone_variety_alias — "Havells India
//      Ltd" resolves to the canonical Havells row without ever becoming a
//      second brand row at all. This is the one that actually matters day
//      to day: normalisation only catches near-misses of the stored name,
//      alias resolution catches anything a human or importer TYPES.
//
// Brand creation staying admin-only (never auto-created by an import) is
// already true of every service in this codebase — no migration needed
// for that part of the fix; it's an application-layer invariant to
// preserve going forward, not a schema one.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      // normalize_brand_name(): lowercase, collapse whitespace, strip a
      // small set of common corporate suffixes. Deliberately NOT
      // exhaustive — "Ltd"/"Pvt"/"Pvt Ltd"/"India"/"Limited"/"Electricals"
      // cover the examples the residual-risks doc names explicitly
      // (HAVELLS, havells, Havells Ltd, Havells India Ltd, Havells
      // Electricals). A brand name that still collides after this
      // normalisation is a genuine near-duplicate worth a human's
      // attention at creation time, which is exactly what the unique
      // index is for.
      await q(`
        CREATE OR REPLACE FUNCTION normalize_brand_name(p_name TEXT)
        RETURNS TEXT AS $$
          SELECT btrim(
            regexp_replace(
              regexp_replace(
                lower(p_name),
                '\\s+(pvt\\.?\\s*ltd\\.?|ltd\\.?|limited|india|electricals?)\\s*$',
                '', 'gi'
              ),
              '\\s+', ' ', 'g'
            )
          );
        $$ LANGUAGE sql IMMUTABLE;
      `);

      // A functional unique index, not a stored column — normalize_brand_name
      // has no dependency on brand's own rows, so this stays correct without
      // a trigger to keep a column in sync.
      await q(`
        CREATE UNIQUE INDEX idx_brand_normalized_name_unique
          ON brand (normalize_brand_name(name));
      `);

      await queryInterface.createTable(
        'brand_alias',
        {
          // gen_random_uuid(), not Sequelize.UUIDV4 — a real Postgres-side
          // default, not a client-side one, so a raw-SQL insert (a bulk
          // alias import, say) doesn't hit the same NULL-id gap fixed in
          // vendor_listing_flag's migration.
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            primaryKey: true,
          },
          brand_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'brand', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          // Normalized lowercase, same convention as stone_variety_alias —
          // "havells india ltd" as typed resolves via this table before
          // ever becoming a create-brand candidate.
          alias: {
            type: Sequelize.STRING(160),
            allowNull: false,
            unique: true,
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction: t },
      );

      await q(`
        CREATE INDEX idx_brand_alias_trgm ON brand_alias USING GIN (alias gin_trgm_ops);
      `);
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
      await queryInterface.dropTable('brand_alias', { transaction: t });
      await q('DROP INDEX IF EXISTS idx_brand_normalized_name_unique;');
      await q('DROP FUNCTION IF EXISTS normalize_brand_name(TEXT);');
    });
  },
};
