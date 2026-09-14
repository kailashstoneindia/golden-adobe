'use strict';
const { v4: uuidv4 } = require('uuid');

// Brands for the Sanitaryware & Bath launch category. Same rationale, same
// idempotency shape and same "never guess a compliance field" rule as
// 20260908090000-seed-electrical-brands.js.
//
// Sources fetched 2026-09-13.

const BRANDS = [
  {
    name: 'Cera',
    slug: 'cera',
    manufacturer_name: 'Cera Sanitaryware Limited',
    manufacturer_address:
      '9, GIDC Industrial Estate, Kadi, District Mehsana, North Gujarat, Gujarat 382715, India',
    consumer_care_email: 'ceracare@cera-india.com',
    consumer_care_phone: '1800-258-5500',
    // source: https://www.cera-india.com/registered-office +
    //         https://www.cera-india.com/cera-care
    // NOTE: individual Cera faucet products fetched this pass (pillar cock
    // F2014104, bib cock F2014151) both state "Country of Origin: China" on
    // their own product pages -- confirmed directly, not assumed. The brand
    // itself is an Indian manufacturer per its registered office above;
    // country_of_origin must be sourced per PRODUCT, not defaulted from the
    // brand's home country. Do not blanket-assume "India" for Cera products
    // without checking each one, the way earlier Havells/Astral rows safely
    // could (those were confirmed India-made on their own pages).
    aliases: ['cera sanitaryware', 'cera sanitaryware limited', 'cera india'],
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
      `[seed-sanitaryware-brands] inserted this run: ${brandsInserted} brands, ${aliasesInserted} aliases`,
    );
    // eslint-disable-next-line no-console
    console.log(`[seed-sanitaryware-brands] totals now: ${totals.brands} brands, ${totals.aliases} aliases`);
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
// NOT SEEDED — Jaquar. jaquar.com returned HTTP 403 (blocked) on every
// product-page fetch attempted this pass. Hindware not yet attempted.
// ---------------------------------------------------------------------------
