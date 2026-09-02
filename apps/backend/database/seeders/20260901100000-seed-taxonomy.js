'use strict';

const { UNITS, GLOBAL_ATTRIBUTES, TREE } = require('../seed-data/taxonomy');

/**
 * Phase 1 taxonomy seeder — 8 top-level categories to 58 leaves, the attribute
 * model, and enum value options. Data lives in ../seed-data/taxonomy.js, which
 * mirrors docs/catalog-structure.md.
 *
 * Idempotent: every insert is keyed on a natural key (uom.code,
 * category.path, attribute.code, and (attribute_id, value) for options) and
 * skips what already exists, so re-running adds only what is missing. That
 * matters because this is the seeder most likely to be re-run as the taxonomy
 * is corrected.
 *
 * category.level / path / is_leaf are maintained by the invariant triggers
 * from 20260825090006, so this seeder writes them explicitly but consistently
 * with what those triggers enforce — parent first, then children, so path is
 * always derivable.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql, replacements) =>
        queryInterface.sequelize.query(sql, {
          replacements,
          transaction: t,
          type: Sequelize.QueryTypes.SELECT,
        });

      // ── units of measure ────────────────────────────────────────────────
      const uomIdByCode = {};
      for (const [code, name] of UNITS) {
        const [row] = await q(
          `INSERT INTO unit_of_measure (id, code, name)
           VALUES (gen_random_uuid(), :code, :name)
           ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          { code, name },
        );
        uomIdByCode[code] = row.id;
      }

      // ── global attributes (category_id IS NULL — finding 1) ─────────────
      let attributeCount = 0;
      let optionCount = 0;

      const insertAttribute = async (attr, categoryId, displayOrder) => {
        const [code, name, dataType, unit, variantDefining, filterable, values] = attr;

        const existing = await q(`SELECT id FROM attribute WHERE code = :code`, { code });
        let attributeId;
        if (existing.length > 0) {
          attributeId = existing[0].id;
        } else {
          const [row] = await q(
            `INSERT INTO attribute
               (id, category_id, code, name, data_type, unit,
                is_variant_defining, is_searchable_filter, display_order)
             VALUES (gen_random_uuid(), :categoryId, :code, :name,
                     CAST(:dataType AS attribute_data_type), :unit,
                     :variantDefining, :filterable, :displayOrder)
             RETURNING id`,
            {
              categoryId,
              code,
              name,
              dataType,
              unit,
              variantDefining,
              filterable,
              displayOrder,
            },
          );
          attributeId = row.id;
          attributeCount += 1;
        }

        // Enum options, in declaration order.
        for (let i = 0; i < values.length; i += 1) {
          const inserted = await q(
            `INSERT INTO attribute_value_option (id, attribute_id, value, display_order)
             VALUES (gen_random_uuid(), :attributeId, :value, :displayOrder)
             ON CONFLICT (attribute_id, value) DO NOTHING
             RETURNING id`,
            { attributeId, value: values[i], displayOrder: i },
          );
          if (inserted.length > 0) optionCount += 1;
        }
      };

      for (let i = 0; i < GLOBAL_ATTRIBUTES.length; i += 1) {
        await insertAttribute(GLOBAL_ATTRIBUTES[i], null, i);
      }

      // ── category tree ───────────────────────────────────────────────────
      let categoryCount = 0;

      const insertCategory = async (node, parentId, parentPath, level, displayOrder) => {
        const path = parentPath ? `${parentPath}/${node.slug}` : node.slug;
        const isLeaf = !node.children || node.children.length === 0;

        const existing = await q(`SELECT id FROM category WHERE path = :path`, { path });
        let categoryId;
        if (existing.length > 0) {
          categoryId = existing[0].id;
        } else {
          const [row] = await q(
            `INSERT INTO category
               (id, parent_id, name, slug, level, path, is_leaf,
                unit_of_measure_default_id, display_order)
             VALUES (gen_random_uuid(), :parentId, :name, :slug, :level, :path, :isLeaf,
                     :uomId, :displayOrder)
             RETURNING id`,
            {
              parentId,
              name: node.name,
              slug: node.slug,
              level,
              path,
              isLeaf,
              uomId: node.uom ? uomIdByCode[node.uom] : null,
              displayOrder,
            },
          );
          categoryId = row.id;
          categoryCount += 1;
        }

        // Attributes declared AT this node. Descendants inherit them via the
        // category ancestry walk, so they are never repeated on children.
        for (let i = 0; i < (node.attrs || []).length; i += 1) {
          await insertAttribute(node.attrs[i], categoryId, i);
        }

        for (let i = 0; i < (node.children || []).length; i += 1) {
          await insertCategory(node.children[i], categoryId, path, level + 1, i);
        }
      };

      for (let i = 0; i < TREE.length; i += 1) {
        await insertCategory(TREE[i], null, null, 1, i);
      }

      // Loud enough to notice in migration output, and a cheap sanity check
      // against docs/catalog-structure.md's own summary (58 leaves).
      const [counts] = await q(
        `SELECT
           (SELECT COUNT(*) FROM category)                          AS categories,
           (SELECT COUNT(*) FROM category WHERE is_leaf)            AS leaves,
           (SELECT COUNT(*) FROM attribute)                         AS attributes,
           (SELECT COUNT(*) FROM attribute WHERE category_id IS NULL) AS global_attributes,
           (SELECT COUNT(*) FROM attribute_value_option)            AS enum_options,
           (SELECT COUNT(*) FROM unit_of_measure)                   AS units`,
      );
      console.log(
        `[seed-taxonomy] inserted this run: ${categoryCount} categories, ` +
          `${attributeCount} attributes, ${optionCount} enum options`,
      );
      console.log(
        `[seed-taxonomy] totals now: ${counts.categories} categories ` +
          `(${counts.leaves} leaf), ${counts.attributes} attributes ` +
          `(${counts.global_attributes} global), ${counts.enum_options} enum options, ` +
          `${counts.units} units`,
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      // Options and attributes first (FK), then categories deepest-first.
      await queryInterface.sequelize.query(
        `DELETE FROM attribute_value_option
         WHERE attribute_id IN (SELECT id FROM attribute)`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(`DELETE FROM attribute`, { transaction: t });
      await queryInterface.sequelize.query(
        `DELETE FROM category WHERE id IN (
           SELECT id FROM category ORDER BY level DESC
         )`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(`DELETE FROM unit_of_measure`, { transaction: t });
    });
  },
};
