'use strict';
const { v4: uuidv4 } = require('uuid');

// Brands for the Plumbing launch category. Same rationale, same
// idempotency shape and same "never guess a compliance field" rule as
// 20260908090000-seed-electrical-brands.js — see that file's header for the
// full explanation of why this gates product import and how
// normalize_brand_name() actually behaves.
//
// Sources fetched 2026-09-13, re-verify before relying on these
// commercially — contact pages change.

const BRANDS = [
  {
    name: 'Astral',
    slug: 'astral',
    manufacturer_name: 'Astral Limited',
    manufacturer_address:
      'Astral House, 207/1, Behind Rajpath Club, Off S.G. Highway, Ahmedabad 380059, Gujarat, India',
    consumer_care_email: 'info@astralpipes.com',
    consumer_care_phone: '1800 233 7957',
    // source: https://www.astralpipes.com/contact-us/
    // Formerly "Astral Poly Technik Limited" (per their own investor PDFs) —
    // aliased below since older invoices/vendor sheets may still carry it.
    aliases: ['astral pipes', 'astral limited', 'astral poly technik', 'astral poly technik limited'],
  },
  {
    name: 'Supreme',
    slug: 'supreme',
    manufacturer_name: 'The Supreme Industries Limited',
    manufacturer_address: '612, Raheja Chambers, Nariman Point, Mumbai 400021, Maharashtra, India',
    consumer_care_email: 'info@supreme.co.in',
    // Piping-specific toll-free, not the generic corporate line — this is
    // the number that actually serves the products being seeded.
    consumer_care_phone: '1800 3099 111',
    // source: https://www.supreme.co.in/contact-us
    aliases: ['supreme industries', 'supreme industries limited', 'the supreme industries limited'],
  },
];

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id, name, normalize_brand_name(name) AS norm FROM brand`,
    );
    const byNorm = new Map(existing.map((row) => [row.norm, row.id]));

    let brandsInserted = 0;
    let aliasesInserted = 0;

    for (const brand of BRANDS) {
      const [[{ norm }]] = await queryInterface.sequelize.query(
        `SELECT normalize_brand_name(:name) AS norm`,
        { replacements: { name: brand.name } },
      );

      let brandId = byNorm.get(norm);

      if (!brandId) {
        brandId = uuidv4();
        await queryInterface.bulkInsert('brand', [
          {
            id: brandId,
            name: brand.name,
            slug: brand.slug,
            manufacturer_name: brand.manufacturer_name,
            manufacturer_address: brand.manufacturer_address,
            consumer_care_email: brand.consumer_care_email,
            consumer_care_phone: brand.consumer_care_phone,
            is_active: true,
            created_at: now,
            updated_at: now,
          },
        ]);
        byNorm.set(norm, brandId);
        brandsInserted += 1;
      }

      for (const alias of brand.aliases) {
        const inserted = await queryInterface.sequelize.query(
          `INSERT INTO brand_alias (id, brand_id, alias, created_at)
           VALUES (:id, :brandId, :alias, :now)
           ON CONFLICT (alias) DO NOTHING
           RETURNING id`,
          {
            replacements: {
              id: uuidv4(),
              brandId,
              alias: alias.trim().toLowerCase().replace(/\s+/g, ' '),
              now,
            },
          },
        );
        if (inserted[0].length > 0) aliasesInserted += 1;
      }
    }

    const [[totals]] = await queryInterface.sequelize.query(
      `SELECT (SELECT COUNT(*) FROM brand)       AS brands,
              (SELECT COUNT(*) FROM brand_alias) AS aliases`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[seed-plumbing-brands] inserted this run: ${brandsInserted} brands, ${aliasesInserted} aliases`,
    );
    // eslint-disable-next-line no-console
    console.log(`[seed-plumbing-brands] totals now: ${totals.brands} brands, ${totals.aliases} aliases`);
  },

  down: async (queryInterface) => {
    const slugs = BRANDS.map((b) => b.slug);
    await queryInterface.sequelize.query(
      `DELETE FROM brand_alias
        WHERE brand_id IN (SELECT id FROM brand WHERE slug IN (:slugs))`,
      { replacements: { slugs } },
    );
    await queryInterface.bulkDelete('brand', { slug: slugs });
  },
};

// ---------------------------------------------------------------------------
// NOT SEEDED — Prince Pipes. Own site (princepipes.com) has no fetchable
// contact/registered-office page found in this pass, and product data itself
// is thin (no structured listing, sizes not stated) -- see
// docs/seed-sourcing/plumbing-summary.md. Revisit if their contact page and
// product data are both confirmed in a later pass.
// ---------------------------------------------------------------------------
