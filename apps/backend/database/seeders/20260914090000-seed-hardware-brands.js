'use strict';
const { v4: uuidv4 } = require('uuid');

// Brands for the Hardware Tools & Accessories launch category. Same
// rationale, idempotency shape and "never guess a compliance field" rule as
// 20260908090000-seed-electrical-brands.js.
//
// Sources fetched 2026-09-14.

const BRANDS = [
  {
    name: 'Roff',
    slug: 'roff',
    // Roff is Pidilite's tile/stone-fixing sub-brand, same relationship as
    // Crabtree/Havells: seeded as its OWN brand row (not a Pidilite alias),
    // since that is the name printed on the product and the one vendors and
    // customers will actually search for. Legal Metrology fields are
    // Pidilite's own, since Pidilite Industries Limited is the manufacturer.
    manufacturer_name: 'Pidilite Industries Limited',
    manufacturer_address:
      'Regent Chambers, 7th Floor, Jamnalal Bajaj Marg, 208, Nariman Point, Mumbai 400021, Maharashtra, India',
    consumer_care_email: 'csc@pidilite.com',
    consumer_care_phone: '1800-266-6066',
    // source: https://www.pidilite.com/contact (email/phone, confirmed
    // directly) + search-corroborated registered office address (AGM notice
    // PDF on pidilite.com carries the same address, not independently
    // fetched as plain text this pass).
    aliases: ['pidilite roff', 'roff tile adhesive', 'roff india'],
  },
  {
    name: 'Karam',
    slug: 'karam',
    manufacturer_name: 'Karam Industries',
    manufacturer_address: 'D-95, Sector 2, Noida, Uttar Pradesh 201301, India',
    consumer_care_email: 'karam@karam.in',
    consumer_care_phone: '1800-103-7085',
    // source: https://www.karam.in/contact-us -- confirmed directly. A
    // search-engine summary for the same query returned
    // customercare@karam.in for the email; the direct page fetch says
    // karam@karam.in and that is what was used, per the standing rule of
    // trusting the direct fetch over a search aggregation.
    aliases: ['karam industries', 'karam safety', 'karam ppe'],
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
      `[seed-hardware-brands] inserted this run: ${brandsInserted} brands, ${aliasesInserted} aliases`,
    );
    // eslint-disable-next-line no-console
    console.log(`[seed-hardware-brands] totals now: ${totals.brands} brands, ${totals.aliases} aliases`);
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
