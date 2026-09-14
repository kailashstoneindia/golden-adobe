'use strict';
const { v4: uuidv4 } = require('uuid');

// Brands for the Electrical launch category, plus their aliases.
//
// WHY THIS RUNS BEFORE ANY PRODUCT SEEDING: catalog-import-upload.service.ts
// Rule 4 resolves `brand` by exact name and REJECTS a row whose brand does not
// already exist — brands are never auto-created, because the Legal Metrology
// fields below have no import column. No master_product can be imported until
// its brand row is here.
//
// Every field except logo_url is NOT NULL (brand.model.ts, decision 0010 —
// Legal Metrology (Packaged Commodities) Rules 2011 as amended 2023). A brand
// that cannot supply manufacturer address + consumer care email + phone is
// not listable, so a brand is seeded ONLY when all three were read from the
// brand's own India domain. Partially-sourced brands are listed at the bottom
// of this file rather than seeded with a guessed address — the same
// "never infer" rule the product sourcing follows
// (docs/seed-sourcing/electrical-switchgear-mcb.md).
//
// Sources are recorded per brand. Fetched 2026-09-08 unless stated; contact
// pages change, so re-verify before relying on these commercially.
//
// idx_brand_normalized_name_unique is a FUNCTIONAL unique index over
// normalize_brand_name(). Verified behaviour against the live function
// (2026-09-08) — it strips only ONE trailing token, so it is weaker than it
// first appears:
//
//   'Havells'                        -> 'havells'
//   'Havells India Ltd'              -> 'havells india'     (NOT 'havells')
//   'Legrand India'                  -> 'legrand'
//   'Legrand (India) Private Limited'-> 'legrand (india) private'
//   'Polycab India Limited'          -> 'polycab india'
//
// So "Havells" and "Havells India Ltd" would NOT collide as brand rows — the
// index does not protect against that pair. Aliases are what actually catch
// these spellings, which is why the lists below cover multi-token variants
// (and skip ones like 'legrand india' that normalize onto the brand anyway).

const BRANDS = [
  {
    name: 'Havells',
    slug: 'havells',
    manufacturer_name: 'Havells India Limited',
    manufacturer_address:
      'QRG Towers, 2D, Sector 126, Expressway, Noida 201304, Uttar Pradesh, India',
    consumer_care_email: 'customercare@havells.com',
    consumer_care_phone: '08045771313',
    // source: https://havells.com/contact-us
    // Covers every Electrical leaf and is the single best India source found
    // in the sourcing sweep (docs/seed-sourcing/electrical-summary.md).
    // Both 'ltd' and 'limited' spellings are listed explicitly: the
    // normalizer strips only ONE trailing token, so 'Havells India Ltd'
    // normalizes to 'havells india' and does NOT reach 'havells' on its own.
    aliases: [
      'havells india',
      'havells india ltd',
      'havells india limited',
      'havells electricals',
      'havels',
    ],
  },
  {
    name: 'Crabtree',
    slug: 'crabtree',
    // Havells' premium switch sub-brand, sold as "Havells Crabtree". Seeded as
    // its OWN brand row rather than an alias of Havells: an alias would force
    // every Crabtree product to carry brand = Havells, losing the distinction
    // vendors and customers actually use on the box. Legal Metrology details
    // are Havells' own, since Havells India Limited is the manufacturer.
    manufacturer_name: 'Havells India Limited',
    manufacturer_address:
      'QRG Towers, 2D, Sector 126, Expressway, Noida 201304, Uttar Pradesh, India',
    consumer_care_email: 'customercare@havells.com',
    consumer_care_phone: '08045771313',
    // source: https://havells.com/crabtree/ + https://havells.com/contact-us
    aliases: ['havells crabtree', 'crabtree india'],
  },
  {
    name: 'Legrand',
    slug: 'legrand',
    manufacturer_name: 'Legrand (India) Private Limited',
    manufacturer_address:
      '61 & 62, 6th Floor, Kalpataru Square, Kondivita Road, Off Andheri-Kurla Road, Andheri (East), Mumbai 400059, Maharashtra, India',
    consumer_care_email: 'customer.care@legrand.co.in',
    consumer_care_phone: '022-30416200',
    // source: https://www.legrand.co.in/contact-us
    // India storefront confirmed INR (₹446, ₹267) at shop.legrand.co.in.
    // 'legrand india' is omitted deliberately — it normalizes to 'legrand'
    // and so already resolves via the resolver's second step.
    aliases: [
      'legrand (india) private limited',
      'legrand india pvt ltd',
      'legrand dx3',
    ],
  },
  {
    name: 'Polycab',
    slug: 'polycab',
    manufacturer_name: 'Polycab India Limited',
    manufacturer_address:
      'Unit 4, Plot No. 105, Halol Vadodara Road, Village Nurpura, Taluka Halol, Panchmahal, Gujarat 389350, India',
    consumer_care_email: 'customercare@polycab.com',
    consumer_care_phone: '+91-22-2432-7070',
    // source: https://polycab.com/contact-us/support
    // Phone is the Mumbai corporate line; Polycab publishes no single
    // toll-free consumer number. Registered office address is the Halol
    // manufacturing unit, per their own contact page.
    aliases: [
      'polycab india',
      'polycab india ltd',
      'polycab india limited',
      'polycab wires',
      'polycab wires & cables',
    ],
  },
];

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();

    // Idempotent on the NORMALIZED name, not the literal one — re-running must
    // not trip idx_brand_normalized_name_unique, and a seeder that cannot be
    // re-run is a seeder nobody dares run.
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

      // brand_alias.alias is UNIQUE and stored normalized lowercase
      // (brand-alias.model.ts); BrandResolverService matches it FIRST, before
      // falling back to normalize_brand_name() on brand.name itself. Aliases
      // therefore only need to cover spellings the normalizer would NOT
      // already collapse.
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
      `[seed-electrical-brands] inserted this run: ${brandsInserted} brands, ${aliasesInserted} aliases`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[seed-electrical-brands] totals now: ${totals.brands} brands, ${totals.aliases} aliases`,
    );
  },

  down: async (queryInterface) => {
    const slugs = BRANDS.map((b) => b.slug);
    // Aliases cascade on brand delete (brand-alias.model.ts FK), but deleting
    // them explicitly keeps the down() readable and safe if that FK ever
    // changes. Products referencing these brands will block the delete via
    // master_product.brand_id — deliberately: silently orphaning catalog rows
    // to undo a seeder would be worse than a loud failure.
    await queryInterface.sequelize.query(
      `DELETE FROM brand_alias
        WHERE brand_id IN (SELECT id FROM brand WHERE slug IN (:slugs))`,
      { replacements: { slugs } },
    );
    await queryInterface.bulkDelete('brand', { slug: slugs });
  },
};

// ---------------------------------------------------------------------------
// NOT SEEDED — compliance fields incomplete as of 2026-09-08
//
// Schneider Electric  — customercare.in@schneider-electric.com,
//                       toll-free 18001030011 / 18004194272, but the published
//                       address resolved only to "Gurgaon 122002, Haryana".
//                       manufacturer_address is NOT NULL and a partial address
//                       fails Legal Metrology's purpose, so it is not guessed.
// Lauritz Knudsen     — formerly L&T Switchgear. smartshop.lk-ea.com returned
//   (ex-L&T)            empty (JS-rendered); no contact details read.
//                       ⚠️ When added, alias 'l&t' and 'l&t switchgear' — the
//                       rename is recent and vendors will type the old name
//                       for years.
// Anchor by Panasonic — lsin.panasonic.com is Profile D (PDF-only); contact
//                       details not yet read. Aliases 'anchor', 'panasonic'.
// Orient Electric,    — fans dropped from scope 2026-09-08.
//   Crompton, Usha
//
// Add each once all three Legal Metrology fields are read from that brand's
// own India domain — never from a reseller or aggregator.
// ---------------------------------------------------------------------------
