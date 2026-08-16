# 0014 — Batch resolution of open questions

- **Date:** 2026-08-02
- **Status:** Accepted
- **Supersedes:** the `paint_shade` entity in
  [0002](0002-paint-shade-and-tinting.md); the `gst_rate` placement in
  [0010](0010-indian-compliance-fields.md)

## Context

A single review pass resolved most of the open questions accumulated across 0001–0013. Only
the substantive ones are reasoned through below; the rest are recorded as a table.

---

## 1. Paint shade data is dropped entirely

**The largest change here.** [0002](0002-paint-shade-and-tinting.md) introduced `paint_shade`
to hold 1,800+ shades per brand — code, name, hex, colour family, base type.

That table is removed, along with the ingestion job behind it.

**Why it stopped earning its place.** [0007](0007-colour-family-pricing.md) moved pricing to
the colour family, which was the shade's last structural role. What remained was a large,
recurring ETL against brand shade cards — data the platform never transacts on, and which
goes stale every time a brand revises a fan deck.

**What replaces it:** the customer picks a **colour family** and may attach a visual
reference; the vendor finalises the exact shade at the counter using their physical fan
deck. That is how Indian paint buying already works — people go and look at the deck.

```
order_item.configuration
  { "colour_family": "beige",
    "reference_hex": "#E8D9B5",     -- optional, VISUAL ONLY
    "note": "matching my curtains" }
```

**`reference_hex` is not an orderable identifier.** A tinting machine dispenses from a shade
code, never from an RGB value — the hex exists so the customer can express intent, not so
the shop can act on it mechanically.

**What is lost, stated plainly:** no real swatches on the product page, no browsing actual
brand shades, and orders say "beige" rather than "Wheat Field 8021". Accepted for MVP.

**Revisit if** orders need to name an exact, orderable shade. A curated list — say the top
100 shades per brand — is the middle path, and reintroducing it is additive.

## 2. Brands without consumer care details are not listed

Legal Metrology requires a consumer care email and phone on every listing
([0010](0010-indian-compliance-fields.md)). Small local manufacturers may have neither.

`brand.manufacturer_name`, `manufacturer_address`, `consumer_care_email` and
`consumer_care_phone` become **`NOT NULL`**. A brand that cannot supply them cannot be
created, so its products cannot be listed.

Strict, and it will block some genuine small brands. The trade accepted: compliance becomes
structural rather than dependent on someone remembering to fill a field.

> ⚠️ This is a legal interpretation, not a design decision. Worth a CA or lawyer confirming
> before launch — particularly whether a vendor's own contact details could serve as a
> compliant fallback, which would soften this considerably.

## 3. `hsn_code` becomes a reference table owning GST rates

```sql
hsn_code (code PK, description, gst_rate, is_active)
master_product.hsn_code  REFERENCES hsn_code(code)
master_product.gst_rate  -- snapshot, written from hsn_code at write time
```

GST follows the HSN code, never the seller. The rate is **snapshotted onto the product**
rather than joined on read, so that revising a rate does not silently rewrite historical
invoices.

## 4. Enum attribute values are enforced by trigger

A foreign key cannot express "this value must exist in `attribute_value_option`, but only
when the attribute's `data_type` is `enum`" — Postgres has no partial foreign key. A
`BEFORE INSERT OR UPDATE` trigger on `master_product_attribute_value` does it instead.

Without this, a typo in an enum value is invisible to the database, and it would also
corrupt `identity_hash` — two spellings of the same value hash differently.

## 5. `identity_hash` is versioned

`identity_hash_version SMALLINT NOT NULL DEFAULT 1`.

If the normalisation rules ever change — different whitespace handling, different numeric
canonicalisation — old hashes stop being comparable to new ones. The version makes that
detectable and drives a rebuild, instead of the constraint silently failing to catch
duplicates.

## 6. `updated_at` advances on every cache rebuild

Previously the value-change trigger touched `updated_at` and the category-move trigger did
not. Both now do. `updated_at` is the natural key for incremental search-index sync, so an
inconsistency there would cause products to be silently missed.

---

## Everything else, as decided

| # | Question | Resolution |
|---|---|---|
| 1 | Catalog seeding owner | Seeded in-house from internet sources; client supplies corrections after launch |
| 2 | Launch scope | **All eight categories** |
| 3 | When seeding starts | Manually, during Phase 2 |
| 4 | Drainer schedule | NestJS `@Cron`, ~60s |
| 5 | Excel format | `.xlsx` via `exceljs` — locked columns and dropdowns |
| 8 | Vendor portal owner | Backend developer |
| 9 | Custom / computer-matched shades | Supported |
| 10 | Shade whose family a vendor hasn't priced | Show as unavailable |
| 11 | Untinted white | An ordinary `colour_family` value |
| 12 | Paint availability | `vendor_listing.status = 'out_of_stock'` — no new column |
| 13 | Stone volume discounts | Deferred |
| 14 | Stone order quantity | `min_order_qty` |
| 15 | Coarse grade band | Yes, add |
| 16 | "Packer" for loose goods | **Moot** — sand, aggregate and cement are not among the eight categories. The concern was inherited from the original draft doc's examples |
| 18 | Stone sample requests | Not needed |
| 23 | Grade label normalisation | Dropdown of common labels + normalise on write |
| 24 | Soft duplicate warning blocking | Not now |
| 29 | Hash algorithm | `md5` |
| 30 | Price-only update sheet | Yes, keyed on `product_code` |
| 31 | Wastage | Customer supplies a pre-calculated quantity; no schema change |
| 32 | Brand creation | Allowed, subject to the `NOT NULL` care fields above |
| 33 | Wrong-match confirmation UI | Show ranked candidates, not a single confirm button |
| 34 | Require variant attributes at publish | **No** — residual risk 3 accepted |
| 35 | Customer "report wrong product" | Not for now |

Deferred with no decision: 21 (auto-publish threshold) and 22 (price-outlier threshold) —
both need real data to tune.

## Consequences

- **21 tables.** `paint_shade` removed, `hsn_code` added.
- Paint has no reference data of its own. `paint_colour_family` remains as an enum, used by
  `vendor_listing_colour_price` and the order line.
- The `paint_shade` ingestion workstream disappears from the build order — one fewer ETL job
  and one fewer thing to keep current.
- Brand creation is now gated by four required fields. Seeding a brand becomes slightly
  heavier, and some small brands will be unlistable until they supply contact details.
- `hsn_code` needs seeding with the codes and rates for all eight categories before products
  can be created.
- Accepting 34 means residual risk 3 stands: a product published with a variant-defining
  attribute left blank hashes differently and can duplicate. This is the known hole in
  Stone and Hardware.

## Open questions

1. **Colour-family pricing scope** — answered "per vendor", but an absolute price cannot be
   vendor-wide: Royale 20L blue and Tractor 4L blue are different amounts. Either it is
   per listing (as currently modelled), or it is a per-vendor *delta* on top of a base
   price. Needs one more round. See below.
2. Whether a vendor's contact details can legally substitute for a brand's consumer care
   details (question 2 above).
3. Auto-publish confidence threshold; price-outlier threshold. Both need production data.
