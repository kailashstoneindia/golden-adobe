'use strict';

// HSN codes for the launch categories.
//
// WHY: master_product.hsn_code is a FOREIGN KEY to hsn_code.code, but the
// table was never seeded — and catalog-import-upload.service.ts validates
// `hsn_code` for nothing (it checks required-ness, enums, numerics, brand and
// duplicates, but not this FK). The result is that ANY import carrying an
// hsn_code fails with a raw 500:
//
//   insert or update on table "master_product" violates foreign key
//   constraint "master_product_hsn_code_fkey"
//
// — not a per-row rejection an admin could act on. Found 2026-09-08 on the
// first real product import (Havells Crabtree switches, HSN 8536).
//
// gst_rate here is the rate that HSN attracts. It is deliberately NOT the
// same field as master_product.gst_rate, which the importer defaults to 18.0;
// hsn_code.gst_rate carries its own CHECK constraint and exists so a mismatch
// between the two is detectable.
//
// SCOPE: launch categories only (decision: Electrical / Plumbing /
// Sanitaryware / Tiles / Paint / Lights / Hardware / Stone). This is not the
// full Indian HSN schedule — it is the subset the catalog can currently
// reference, extended as categories are seeded.
//
// ⚠️ RATES ARE NOT LEGAL ADVICE. GST rates change by notification and several
// of these sit near slab boundaries. They were entered from the commonly
// applied rate per chapter heading for these goods, NOT read from a CBIC
// notification in this session. Have them confirmed by whoever files your
// returns before invoicing against them.

const HSN = [
  // --- Electrical (Chapter 85) ---
  ['8536', 'Electrical apparatus for switching or protecting circuits (switches, sockets, MCBs, RCCBs) for a voltage not exceeding 1000 V', 18],
  ['8537', 'Boards, panels, consoles and distribution boards equipped with switching apparatus', 18],
  ['8544', 'Insulated wire, cable and other insulated electric conductors', 18],
  ['8539', 'Electric filament or discharge lamps, including LED lamps', 12],
  ['9405', 'Luminaires and lighting fittings, LED lights and fixtures', 18],
  ['8414', 'Air or vacuum pumps, fans and ventilating hoods (includes ceiling and exhaust fans)', 18],
  ['8504', 'Electrical transformers, static converters and inductors', 18],

  // --- Plumbing (Chapter 39 plastics, 73/74 metal) ---
  ['3917', 'Tubes, pipes and hoses and their fittings, of plastics', 18],
  ['3922', 'Baths, wash basins, lavatory seats and covers, of plastics', 18],
  ['7307', 'Tube or pipe fittings of iron or steel', 18],
  ['8481', 'Taps, cocks, valves and similar appliances for pipes and tanks', 18],

  // --- Sanitaryware (Chapter 69) ---
  ['6910', 'Ceramic sinks, wash basins, water closet pans, cisterns and similar sanitary fixtures', 18],

  // --- Tiles & Stone (Chapters 68, 69) ---
  ['6907', 'Ceramic flags and paving, hearth or wall tiles; mosaic cubes', 18],
  ['6802', 'Worked monumental or building stone and articles thereof (granite, marble slabs)', 18],
  ['2515', 'Marble, travertine and other calcareous monumental or building stone, crude or roughly trimmed', 5],
  ['2516', 'Granite, porphyry, basalt, sandstone and other monumental or building stone', 5],

  // --- Paint (Chapter 32) ---
  ['3208', 'Paints and varnishes based on synthetic polymers, dispersed or dissolved in a non-aqueous medium', 18],
  ['3209', 'Paints and varnishes based on synthetic polymers, dispersed or dissolved in an aqueous medium (emulsions)', 18],
  ['3214', 'Glaziers putty, resin cements, caulking compounds and surfacing preparations', 18],

  // --- Hardware (Chapters 32, 35, 73, 82, 83) ---
  ['3506', 'Prepared glues and other prepared adhesives', 18],
  ['7318', 'Screws, bolts, nuts, washers and similar articles of iron or steel', 18],
  ['8205', 'Hand tools not elsewhere specified', 18],
  ['8301', 'Padlocks and locks of base metal; keys and parts thereof', 18],
  ['8302', 'Base metal mountings, fittings and similar articles for furniture, doors and windows', 18],
  ['6506', 'Other headgear, including industrial safety helmets', 18],
];

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    let inserted = 0;

    for (const [code, description, gstRate] of HSN) {
      const res = await queryInterface.sequelize.query(
        `INSERT INTO hsn_code (code, description, gst_rate, is_active, created_at, updated_at)
         VALUES (:code, :description, :gstRate, true, :now, :now)
         ON CONFLICT (code) DO NOTHING
         RETURNING code`,
        { replacements: { code, description, gstRate, now } },
      );
      if (res[0].length > 0) inserted += 1;
    }

    const [[total]] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS n FROM hsn_code',
    );
    // eslint-disable-next-line no-console
    console.log(`[seed-hsn-codes] inserted this run: ${inserted}; total now: ${total.n}`);
  },

  down: async (queryInterface) => {
    // Products referencing these codes will block the delete via
    // master_product_hsn_code_fkey — deliberately. Silently orphaning catalog
    // rows to undo a seeder is worse than a loud failure.
    await queryInterface.bulkDelete('hsn_code', { code: HSN.map((h) => h[0]) });
  },
};
