'use strict';

// Phase 7 — price-outlier flag (catalog-integrity-approach.md build order
// #9, decision 0011 section 7). "A wrongly matched product almost always
// presents as a price outlier against sibling listings on the same
// master_product... Flag for admin review; do not auto-unpublish."
//
// A VIEW, not a trigger — this is read-time detection, not a write-time
// gate. Nothing should ever block a vendor from setting their own price;
// the whole point is to surface a SUSPICIOUS pattern for a human to look
// at, never to auto-reject or auto-unpublish (decision 0011 is explicit
// about this).
//
// "Legitimate spread exists — stone grades and paint colour families in
// particular" (0011) — handled structurally, not by tuning a threshold
// around it: stone listings are compared WITHIN THE SAME stated_grade
// (never across grades, which legitimately differ), and paint's
// PRODUCT-LEVEL price (vendor_listing.price, the untinted base) is
// compared normally since that one number IS meant to be uniform across
// colours — the colour deltas live in vendor_listing_colour_price and are
// a separate, deliberately-not-flagged comparison (colour-to-colour spread
// on the SAME vendor's SAME listing is never a matching error, it's
// pricing).
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE VIEW vendor_listing_price_outliers AS
      WITH sibling_stats AS (
        SELECT
          vl.id                AS vendor_listing_id,
          vl.master_product_id,
          vl.stated_grade,
          vl.price,
          -- Compare within (product, grade) — COALESCE mirrors
          -- vendor_listing_unique's own null-handling so "no grade" listings
          -- compare against each other, never against a specific grade.
          stats.median_price,
          stats.sibling_count
        FROM vendor_listing vl
        JOIN LATERAL (
          SELECT
            percentile_cont(0.5) WITHIN GROUP (ORDER BY vl2.price) AS median_price,
            COUNT(*) AS sibling_count
          FROM vendor_listing vl2
          WHERE vl2.master_product_id = vl.master_product_id
            AND COALESCE(vl2.stated_grade, '') = COALESCE(vl.stated_grade, '')
            AND vl2.status = 'active'
        ) stats ON true
        WHERE vl.status = 'active'
      )
      SELECT
        vendor_listing_id,
        master_product_id,
        stated_grade,
        price,
        median_price,
        sibling_count,
        ROUND((price / NULLIF(median_price, 0))::numeric, 2) AS ratio_to_median
      FROM sibling_stats
      -- Needs at least 3 siblings for "median" to mean anything — a
      -- 2-listing product has no meaningful outlier concept, everything
      -- would flag one of the two.
      WHERE sibling_count >= 3
        -- Outside 3x or under 1/3 of the median — a deliberately wide band.
        -- catalog-vendor-export-analysis.md's own worked example (420 418
        -- 425 vs 4200) is a 10x gap; this catches that with wide margin
        -- while tolerating normal price variance between vendors.
        AND (price > median_price * 3 OR price < median_price / 3);
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS vendor_listing_price_outliers;');
  },
};
