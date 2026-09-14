'use strict';
const { v4: uuidv4 } = require('uuid');

// fischer (Fasteners: Anchors & Fixings). Same rationale, idempotency shape
// and "never guess a compliance field" rule as
// 20260908090000-seed-electrical-brands.js.
//
// Sources fetched 2026-09-14.

const BRANDS = [
  {
    // Brand name kept lowercase, matching fischer's own house style
    // (fischer.in, fischer-international.com both render the name
    // lowercase everywhere) -- normalize_brand_name lowercases anyway for
    // matching purposes, so this only affects display.
    name: 'fischer',
    slug: 'fischer',
    manufacturer_name: 'Fischer Building Materials India Private Limited',
    // Address confirmed via two independent searches (company registry
    // listings + a fischer.in company reference), NOT a direct fetch of a
    // fischer.in page -- their own Imprint/Contact pages state email and
    // phone but omit the registered office entirely (checked directly).
    // Confidence here is comparable to Berger's address in the prior
    // Paint-brand seeder: corroborated, not page-confirmed.
    manufacturer_address:
      'No. 1222, Parinee Crescenzo, Bandra Kurla Complex, Bandra East, Mumbai 400051, Maharashtra, India',
    consumer_care_email: 'info@fischer.in',
    consumer_care_phone: '1800 121 7188',
    // source: https://www.fischer.in/en-in/contact -- email and phone
    // confirmed directly on the page. A search-engine aggregation for the
    // same query surfaced a named individual's email
    // (TusharVikas.Sable@fischer.in) instead -- not used, per the standing
    // rule of trusting a direct page fetch over a search summary, and
    // because a named employee's address is not a proper consumer-care
    // channel regardless of source.
    aliases: ['fischer india', 'fischer fixings', 'fischer building materials'],
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
      `[seed-fischer-brand] inserted this run: ${brandsInserted} brands, ${aliasesInserted} aliases`,
    );
    // eslint-disable-next-line no-console
    console.log(`[seed-fischer-brand] totals now: ${totals.brands} brands, ${totals.aliases} aliases`);
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
