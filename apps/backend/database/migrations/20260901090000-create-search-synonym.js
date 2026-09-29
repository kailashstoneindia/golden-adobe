'use strict';

/**
 * Phase 6e (decisions 0019, 0021) — admin-editable search synonyms.
 *
 * Decision 0019 settled that synonyms are admin-editable rather than a
 * hard-coded constant, because the vocabulary gap in this catalog is a
 * business fact that changes without a deploy: customers search "MCB" for
 * what a catalog calls a "miniature circuit breaker", "commode" for a "water
 * closet", "tiles" for both floor and wall.
 *
 * They live here rather than in meili.indexes.ts's static settings because a
 * synonym change must not require a code change. meili.bootstrap.ts reads this
 * table on boot and merges the result into the index settings.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.createTable(
        'search_synonym',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            // Literal, not Sequelize.UUIDV4 — that is a client-side JS default
            // and would be invisible to any raw SQL insert (a seeder, an admin
            // bulk import, a trigger). This project has hit that bug several
            // times; the DB-side default is the fix.
            defaultValue: Sequelize.literal('gen_random_uuid()'),
          },
          term: {
            type: Sequelize.STRING(64),
            allowNull: false,
          },
          synonyms: {
            type: Sequelize.ARRAY(Sequelize.STRING(64)),
            allowNull: false,
            defaultValue: [],
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

      // One row per term. Meilisearch's synonym map is keyed by term, so a
      // duplicate term would mean one row silently overwriting the other at
      // bootstrap rather than an error anyone notices.
      await queryInterface.addIndex('search_synonym', ['term'], {
        name: 'idx_search_synonym_term_unique',
        unique: true,
        transaction: t,
      });

      await queryInterface.addIndex('search_synonym', ['is_active'], {
        name: 'idx_search_synonym_active',
        transaction: t,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.dropTable('search_synonym', { transaction: t });
    });
  },
};
