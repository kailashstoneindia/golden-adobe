'use strict';

const { expand } = require('../seed-data/ncr-pincodes');

/**
 * pincode_city_map for the five launch cities (decisions 0018, 0019, 0020).
 *
 * Closes the "who sources it and seeds it" half of 0018 open question 3 —
 * see ../seed-data/ncr-pincodes.js for sources, scope decisions and
 * confidence levels. Pincode is the PRIMARY city signal for NCR search
 * (0020), with coordinates as the tie-break, so this table being right
 * matters more here than in a geographically spread-out launch.
 *
 * Depends on 20260828090000-seed-ncr-cities having run — it resolves cities
 * by slug and fails loudly if one is missing, rather than silently seeding
 * nothing.
 *
 * Idempotent: ON CONFLICT (pincode) DO UPDATE, so re-running corrects a
 * mapping rather than erroring. That is the expected workflow as the scope
 * calls in ncr-pincodes.js get revisited.
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

      const rows = expand();

      const cities = await q(`SELECT id, slug FROM city`);
      const cityIdBySlug = Object.fromEntries(cities.map((c) => [c.slug, c.id]));

      const needed = [...new Set(rows.map((r) => r.citySlug))];
      const missing = needed.filter((slug) => !cityIdBySlug[slug]);
      if (missing.length > 0) {
        throw new Error(
          `Cannot seed pincodes — city rows missing for: ${missing.join(', ')}. ` +
            `Run 20260828090000-seed-ncr-cities first.`,
        );
      }

      // Batched insert — ~140 explicit + 96 Delhi rows is small, but one
      // statement per row would still be needless round trips.
      const values = rows
        .map((_, i) => `(:pincode${i}, :cityId${i})`)
        .join(', ');
      const replacements = {};
      rows.forEach((r, i) => {
        replacements[`pincode${i}`] = r.pincode;
        replacements[`cityId${i}`] = cityIdBySlug[r.citySlug];
      });

      await q(
        `INSERT INTO pincode_city_map (pincode, city_id)
         VALUES ${values}
         ON CONFLICT (pincode) DO UPDATE SET city_id = EXCLUDED.city_id`,
        replacements,
      );

      const breakdown = await q(
        `SELECT c.slug, COUNT(*) AS pincodes
         FROM pincode_city_map m JOIN city c ON c.id = m.city_id
         GROUP BY c.slug ORDER BY c.slug`,
      );
      console.log(
        `[seed-ncr-pincodes] ${rows.length} pincodes seeded: ` +
          breakdown.map((b) => `${b.slug}=${b.pincodes}`).join(', '),
      );
    });
  },

  async down(queryInterface, Sequelize) {
    const { expand } = require('../seed-data/ncr-pincodes');
    const pincodes = expand().map((r) => r.pincode);
    await queryInterface.sequelize.query(
      `DELETE FROM pincode_city_map WHERE pincode IN (:pincodes)`,
      { replacements: { pincodes }, type: Sequelize.QueryTypes.DELETE },
    );
  },
};
