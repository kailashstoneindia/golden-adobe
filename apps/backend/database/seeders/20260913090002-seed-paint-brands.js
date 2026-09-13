'use strict';
const { v4: uuidv4 } = require('uuid');

// Brands for the Paint launch category. Same rationale, same idempotency
// shape and same "never guess a compliance field" rule as
// 20260908090000-seed-electrical-brands.js.
//
// Sources fetched 2026-09-13.

const BRANDS = [
  {
    name: 'Berger',
    slug: 'berger',
    manufacturer_name: 'Berger Paints India Limited',
    // Address confirmed via search against Berger's own domain (CIN
    // L51434WB1923PLC004793 corroborates it as the real registered filing
    // address, not a guess) -- not read directly off a fetched contact page,
    // unlike the email/phone below which were confirmed on two separate
    // bergerpaints.com pages.
    manufacturer_address: 'Berger House, 129, Park Street, Kolkata 700017, West Bengal, India',
    consumer_care_email: 'consumerfeedback@bergerindia.com',
    consumer_care_phone: '1800 103 6030',
    // source: bergerpaints.com/imaginecolours/contact-us +
    //         bergerpaints.com/customer-service/contact-details.html
    aliases: ['berger paints', 'berger paints india', 'berger paints india limited'],
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
      `[seed-paint-brands] inserted this run: ${brandsInserted} brands, ${aliasesInserted} aliases`,
    );
    // eslint-disable-next-line no-console
    console.log(`[seed-paint-brands] totals now: ${totals.brands} brands, ${totals.aliases} aliases`);
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
// NOT SEEDED — Asian Paints. Product detail pages 404 (documented in
// docs/seed-samples/README.md from an earlier session), and pack-size data
// found only on reseller sites (nobroker.in, aapkapainter.com) — explicitly
// excluded by the "brand's own domain only" sourcing rule.
// ---------------------------------------------------------------------------
