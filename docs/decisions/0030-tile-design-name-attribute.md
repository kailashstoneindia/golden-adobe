# 0030 — `tile_design_name` attribute to resolve identity_hash collisions

- **Date:** 2026-09-29
- **Status:** Accepted (tiles); Sparsh Pearl explicitly deferred, see Open questions

## Context

Publishing the seeded catalog for the first time (via the new bulk-publish endpoint, this
same session) surfaced a real defect: 128 of Lavish Ceramics' 192 draft products, and 150 of
Sparsh Pearl's 293, failed to publish on `master_product_generic_identity`
(`UNIQUE (category_id, identity_hash) WHERE status = 'live'`, decision
[0013](0013-identity-hash-for-unbranded-products.md)).

Inspection of one Lavish group (11 products, e.g. "Dimona Matt with Structure Porcelain
Tile", "Dublin Matt with Structure Porcelain Tile", ...) showed these are **genuinely
distinct real tile designs** — different marketing names, visually distinct products a
customer would tell apart — that happen to share every currently variant-defining attribute
(`tile_finish`, `tile_material`, `tile_size`, `tile_thickness`, `tile_colour_family`). The two
attributes that look adjacent were ruled out as the fix:

- `tile_pattern` (enum: Plain/Marble/Stone/Wood) — too coarse, most of the colliding group
  shares one value.
- `tile_colour_name` (free text, not variant-defining) — genuinely a different field, already
  correctly populated with actual colour names ("Mist", "Grey", "Mango Yellow") for a
  different product line (Glenwood/Subway). Repurposing it would have corrupted those
  13 already-correct rows.

The real gap: nothing in the taxonomy captured the design/collection name itself.

## Decision

Add `tile_design_name` (text, variant-defining, searchable filter) to the top-level `tiles`
category (`08b77fb8-69f5-4bbd-b2f0-bbb302385954`), inherited by all leaf subcategories —
seeded via `database/seed-data/taxonomy.js` and `20260901100000-seed-taxonomy.js`, the
established mechanism for taxonomy changes (idempotent re-run, keyed on `(category_id,
code)`).

Backfilled by deriving each product's design name from its own `name` field: strip the
literal `tile_finish` attribute value, strip a fixed material-keyword list (`Porcelain`,
`Ceramic`, `Vitrified`, `GVT`, `PGVT` — chosen because the `tile_material` enum's actual DB
values, e.g. `"Vitrified (GVT)"`, do not appear verbatim in product names, which say
"Porcelain" instead), strip a trailing `Tile`/`Tiles`, and trim what remains. Verified against
the full 122-product original collision set with zero remaining duplicates before writing
anything.

This was applied in three passes as the true scope became clear:

1. 122 draft products in the original collision groups.
2. 2 more draft products that collided against **already-published** products from the very
   first bulk-publish run (published before this attribute existed, so never in the initial
   backfill's scope) — `identity_hash` on a live row does not update itself; it only
   recomputes when something writes to that row's own `master_product_attribute_value` rows.
3. 59 of 63 already-live products that were the "other half" of a collision pair, so their
   stale pre-fix `identity_hash` kept blocking their still-draft sibling. 4 were held back
   (see Consequences) — 2 had cosmetic-only issues and were fine as published, 1 pair
   ("Mek Grit-Tech Porcelain Tile" ×2) turned out to be two real, already-correctly-distinct
   SKUs (different `tile_size`/`tile_pattern`) that a same-name false-positive check flagged
   incorrectly — no action was needed on any of the 4.

Result: **Lavish Ceramics is 192/192 live**, zero remaining drafts, zero remaining
`identity_hash` collisions for this brand.

## Why

Deriving from each product's own recorded name/finish, rather than any external source or
guesswork, kept the fix auditable — every value can be traced to the exact string
transformation applied to a specific product's existing data. The three-pass discovery
(rather than a single sweep) happened because `identity_hash` is trigger-maintained per-row
and does not retroactively recompute for rows nobody writes to; any future backfill of a
variant-defining attribute on a partially-live category needs to check **both draft and live**
rows for the same collision pattern, not just drafts, or it will under-fix exactly as this one
initially did.

## Consequences

- Any product added to a tiles leaf category going forward needs `tile_design_name` populated
  for identity_hash to protect it correctly — this is a new required-in-practice field for
  tiles, though not enforced by the required-variant-attributes trigger unless separately
  flagged (it is not, since it was seeded via the taxonomy file, not requested as a
  "required" attribute in that seeder's meaning — confirm this doesn't need separate action if
  tiles is later re-seeded).
- 4 products held back from any change, for the record: `a2cf2d22-1c26-4f1d-945e-b69307bebdd8`
  ("Ambient GT (Grit-Tech) Porcelain Tile") and `65e54184-c0d5-48a6-a402-4c051ab52143`
  ("Pulpis Polished Porcelain Tile (Grey)") — cosmetically odd names but not currently
  colliding with anything, left as-is; `a09c7eaf-103d-42d8-888e-0f5cefb94de0` and
  `4264b5d5-51a6-4fad-aa7b-c9e8a16b4355` (both "Mek Grit-Tech Porcelain Tile") — confirmed two
  genuinely different, already-live SKUs (600×600 stone-pattern vs 600×1200 wood-pattern), no
  design_name needed since they don't collide.

## Open questions

- **Sparsh Pearl's 150 colliding draft products are explicitly deferred, not fixed.** Their
  collision groups (e.g. "(ABS with Chrome) Round 125mm" vs "Gamma Overhead Round Shower 5\"",
  or a 9-product group mixing "Alpha Square Shower 4x4 with 9\" SS Arm", "Sandwich (SS-304)
  100x100mm", "Ultra Slim (SS-304) 100x100mm") do not follow a clean, mechanically-strippable
  naming convention the way tiles' `{Design} {Finish} {Material} Tile` pattern did. Attempting
  the same text-derivation approach risks assigning wrong or misleading identity values.
  Resolving this needs someone who knows Sparsh Pearl's actual product line to decide, per
  group, which names are real distinct products (needing a new distinguishing attribute,
  possibly `shower_arm_type`/`shower_mount_style` or similar — not yet designed) versus true
  catalog duplicates (which should be merged/removed, not force-published). The full list of
  29 colliding groups was exported for this review but is not reproduced here — see the
  `master_product` table, `WHERE brand_id = '64f268c5-a864-42f9-9a6f-e2be0028ab74' AND status =
'draft' GROUP BY category_id, identity_hash HAVING COUNT(*) > 1`.
- Whether `tile_design_name` should be promoted to a required-variant-defining attribute
  enforced by the publish trigger (Phase 7 risk 3), so this gap can't silently recur for a
  future tile product with no design name recorded at all.

## Sources

- None consulted outside this repository and its live database.
