# 0010 — Legal Metrology fields, and GST at the right level

- **Date:** 2026-08-02
- **Status:** Accepted
- **Supersedes:** the `gst_rate` placement in [0005](0005-attribute-storage-and-identity-columns.md)
  and the `Country of Origin` global attribute in [catalog-structure.md](../catalog-structure.md).

## Context

Two problems, found by checking the schema against Indian requirements rather than
generic e-commerce practice.

**1. Missing mandatory declarations.** The Legal Metrology (Packaged Commodities) Rules
2011, amended 2023, require e-commerce listings to display — prominently, next to the
product image, *before* purchase:

- manufacturer / packer / importer name and address
- consumer care email **and** phone
- country of origin, exposed as a **searchable and sortable filter**
- MRP inclusive of all taxes, and net quantity

The schema had MRP and net quantity. It had no field for the first two, and country of
origin existed only as a non-filterable attribute — which fails the rule even though the
data was present.

**2. `gst_rate` was on `vendor_listing`.** GST is set by HSN code, not by the seller. Two
vendors could therefore declare different GST for the same product — legally wrong, and it
breaks invoicing and price comparison.

## Decision

### Manufacturer and consumer care go on `brand`

```sql
brand (
  ...
  manufacturer_name, manufacturer_address,
  consumer_care_email, consumer_care_phone
)
```

Brand level, because Havells' address and care line are identical across every Havells
product — repeating them per SKU would be thousands of duplicate rows kept in sync by hand.

### Importer details and country of origin go on `master_product`

```sql
master_product (
  ...
  country_of_origin  VARCHAR(64)  NOT NULL,   -- filterable, legally required
  importer_details   TEXT                     -- nullable; imported goods only
)
```

Importer varies per product — an Italian marble and a domestic granite from the same
supplier have different importers — so it cannot sit on `brand`.

**Country of origin becomes a column, not an attribute.** It was a global attribute with
`is_searchable_filter = false`. Making it a column follows the rule from
[0005](0005-attribute-storage-and-identity-columns.md) — if it is on `master_product`, it is
not an attribute — and more importantly makes it `NOT NULL`, so compliance is guaranteed by
the schema rather than by someone remembering to fill an attribute.

It is removed from the global attribute list in `catalog-structure.md`.

### `gst_rate` moves to `master_product`

```sql
master_product.gst_rate   NUMERIC(5,2) NOT NULL DEFAULT 18.00
```

Removed from `vendor_listing` entirely — no per-vendor override, because there is no
legitimate reason for one.

Strictly, GST is a property of the HSN code, so the fully normalised answer is an
`hsn_code` reference table mapping code → rate. Deferred: it is one more table for a
mapping that changes rarely, and `master_product` already stores `hsn_code` beside the rate,
so the migration is straightforward if rates start drifting.

## Consequences

- `master_product` goes from 23 to 26 columns; `brand` gains 4.
- **Generic products have no brand**, so `is_generic = true` rows (sand, aggregate, GI
  fittings) carry no manufacturer or consumer care details. Legal Metrology applies to
  *pre-packaged* commodities, so loose material sold by weight or volume is outside its
  scope — but a packaged generic product would be a genuine gap.
- Excel templates need three new columns: `country_of_origin` (required), `gst_rate`,
  `importer_details`. Brand-level fields are entered once when a brand is created, not per
  upload row.
- Country of origin must be exposed as a filter in the search document, not merely stored.
- Existing draft rows would need backfilling before `country_of_origin NOT NULL` can be
  enforced — relevant only once data exists.

## Open questions

1. **Who is the "packer" for loose goods?** A vendor selling sand by the truckload is
   arguably the packer. Probably outside Legal Metrology's scope, but worth confirming
   before generics go live.
2. Whether an `hsn_code` reference table should own GST rates now rather than later.
3. Consumer care details for products whose brand is a small local manufacturer with no
   care line — a required field with nothing valid to put in it.

## Sources

- [Legal Metrology compliance for e-commerce businesses — SS Rana](https://ssrana.in/articles/legal-metrology-compliance-for-e-commerce-businesses/)
- [LMPC Rules amended: new compliance for e-commerce — Chambers and Partners](https://chambers.com/articles/lmpc-rules-amended-new-compliance-for-e-commerce)
- [Legal Metrology (Packaged Commodities) (Amendment) Rules 2023 — Lexology](https://www.lexology.com/library/detail.aspx?g=e7f9c6b9-8655-4c16-90d4-dcf743fe2c55)
- [Packaging & labelling requirements in India](https://confetti.design/blog/packaging-labeling-requirements-india)
