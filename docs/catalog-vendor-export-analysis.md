# Pre-filled Vendor Export — Feasibility Analysis

Vendors receive a spreadsheet with `product_code` already filled, add price and quantity,
and upload. Exact-code matching replaces fuzzy matching for existing products.

This document assesses whether that works, what it costs, and where it breaks.

**Verdict: technically straightforward, operationally demanding.** The software is roughly
two to three weeks. The real cost is seeding the catalog before any vendor can use it, and
the real risk is export size making the sheet unusable.

---

## 1. The mechanism

```
1. Vendor picks leaf categories + brands at signup
2. Downloads "My Catalog" — product_code pre-filled, name locked
3. Fills price + qty, deletes rows they don't stock
4. Uploads → exact code match
5. Blank-code rows → existing GTIN/MPN/fuzzy ladder → request queue
```

Matching becomes the exception rather than the rule. It runs only for products the vendor
stocks that the catalog does not yet have.

### `product_code` design

```
GA-0012345
│  │
│  └── zero-padded sequence, never reused
└───── constant prefix
```

The prefix is **not** decoration. Excel converts long bare numerics to scientific notation
(`1.23E+05`) and strips leading zeros — `0012345` becomes `12345` silently, on open, with no
warning. A leading `GA-` forces text handling and makes the value survive a round trip
through a vendor's laptop.

Not encoded into the code: category, brand, or any classification. Products get
reclassified; identifiers must not change when they do.

```sql
CREATE SEQUENCE master_product_code_seq;

ALTER TABLE master_product
  ADD COLUMN product_code VARCHAR(16) NOT NULL UNIQUE
    DEFAULT 'GA-' || LPAD(nextval('master_product_code_seq')::text, 7, '0');
```

Public, permanent, never reused — even after a product is deprecated, because it may exist
in a vendor's saved spreadsheet or an old order.

---

## 2. Implementation

### Export

```sql
SELECT mp.product_code, mp.name, b.name AS brand, mp.pack_content_qty, u.code AS unit
FROM master_product mp
LEFT JOIN brand b ON b.id = mp.brand_id
LEFT JOIN unit_of_measure u ON u.id = mp.unit_of_measure_id
WHERE mp.status = 'live'
  AND mp.category_id = ANY(:vendor_leaf_categories)
  AND (:brand_filter IS NULL OR mp.brand_id = ANY(:brand_filter))
ORDER BY b.name, mp.name;
```

Emitted columns:

| Column | Vendor edits? |
|---|---|
| `product_code` | **No** — locked |
| `product_name` | **No** — display only, ignored on import |
| `brand`, `pack`, `unit` | No — context so they recognise the row |
| `price`, `qty_available`, `min_order_qty`, `pincodes`, `status` | **Yes** |

### Import

1. Parse **by header name, not column position** — vendors reorder and insert columns
2. `product_code` present → direct lookup, no matching
3. Code present but unknown or deprecated → reject that row with a clear reason
4. Code blank, name present → existing GTIN → MPN → fuzzy ladder
5. Both blank → skip
6. Upsert on `(vendor_id, master_product_id, COALESCE(stated_grade,''))`

`product_name` is deliberately ignored rather than trusted. If a vendor edits it, the code
still governs — but a mismatch between the supplied name and the catalog name is a useful
warning that they edited the wrong row.

### Effort

| Piece | Estimate |
|---|---|
| `product_code` column, sequence, backfill | 0.5 day |
| Export query + scoping (categories, brands, incremental) | 3 days |
| Vendor-facing download UI | 2 days |
| Import: code path, upsert, idempotency | 3 days |
| Validation + returned error file | 3 days |
| Paint and stone variants | 3 days |
| Testing with real vendor spreadsheets | 3 days |
| **Total** | **~3 weeks** |

Assumes catalog CRUD and vendor auth already exist. Much of the import work is needed
regardless of this approach.

---

## 3. Complexities

### 3.1 Export size — the biggest practical risk

A vendor registering for Hardware inherits 19 leaf categories. At a mature catalog size that
is easily 8,000–10,000 rows, of which they stock perhaps 200.

**A 10,000-row sheet is as unusable as no sheet at all.** Nobody scrolls it, and deleting
9,800 rows is worse than typing 200 names.

Mitigations, in order of value:

1. **Scope at leaf level, not shop type.** Vendor picks "MCB, Wires & Cables, Switches",
   not "Electrical". Registration scope (`vendor_category`, level 1) and export scope are
   different things and should not be conflated.
2. **Brand filter.** A shop carrying only Havells and Anchor cuts an electrical export by
   perhaps 80%.
3. **Incremental export** — "only products added since my last download".
4. **Search-then-export** in the portal, for vendors who prefer to build a list.

Without at least the first two, this approach fails on contact with a real catalog.

### 3.2 Excel will corrupt data

Beyond scientific notation and leading zeros:

| Behaviour | Impact | Mitigation |
|---|---|---|
| Auto-date conversion (`3-5` → 3 May) | Corrupts sizes, ratios | Quote fields; validate on import |
| Comma-separated pincodes split across columns | Service area lost | Quote; or accept space/semicolon separators |
| UTF-8 mangling of ₹ and Indian names | Garbled text | UTF-8 BOM on export |
| Trailing whitespace on codes | Lookup miss | `TRIM()` before lookup |
| Vendor deletes the code column entirely | Everything falls to fuzzy | Detect missing header, reject file with guidance |

These are not edge cases. Every one will occur within the first fifty uploads.

### 3.3 Stale exports

A vendor downloads in January and uploads in June. Meanwhile products were deprecated,
renamed, or reclassified.

- Stamp the export with a generated-at timestamp in the file
- Reject rows whose code is now deprecated, naming the replacement where one exists
- Warn — do not fail — when the supplied name differs from the current catalog name
- Never reuse a code, so a stale code is always resolvable to something

### 3.4 Paint and stone don't fit cleanly

**Paint** needs one row per colour family. Two options:

- *Pre-expand*: 50 products × 13 families = 650 rows. Mechanically simple; the sheet is
  large but every row is meaningful.
- *Vendor duplicates rows*: smaller export, but relies on the vendor understanding they must
  add rows.

Pre-expansion is safer, and a paint shop's export is small enough to absorb it.

**Stone** needs one row per grade — and grades are vendor-specific, so they cannot be
pre-filled. The export carries one row per product with a blank `grade` column, and the
vendor duplicates rows per grade they stock. This is the one category where the vendor must
add rows rather than only edit them.

### 3.5 The catalog must exist first

This is a **hard sequencing dependency**. Vendors cannot pick from an empty catalog, so the
seed catalog must be substantially complete before vendor onboarding begins at all.

That inverts the usual marketplace bootstrap, where sellers bring their own catalog. Here
the platform carries the cost up front.

### 3.6 Ongoing catalog growth

Every vendor request adds admin review load. If ten vendors each request forty missing
products in month one, that is 400 reviews — each needing category placement, attributes,
HSN, and images.

Admin approval throughput becomes the growth bottleneck, not vendor signup.

---

## 4. Business effort

### Seeding the catalog

The dominant cost. Rough sizing for a credible launch catalog:

| Category | Est. SKUs | Data availability |
|---|---|---|
| Electrical | 800–1,200 | Good — Havells, Legrand, Anchor publish full catalogs |
| Plumbing | 400–600 | Good — Astral, Supreme, Prince publish specs |
| Sanitaryware & Bath | 500–800 | Good — Jaquar, Cera, Hindware catalogs |
| Hardware Tools | 1,000–1,500 | **Poor** — highly fragmented, many unbranded |
| Lights | 300–500 | Medium — decorative, image-heavy |
| Tiles | 600–1,000 | Good — Kajaria, Somany, Nitco publish specs |
| Paint | 150–250 products + shade cards | Good — but shades are a separate ingestion |
| Stone | 100–200 varieties | **Poor** — no standard catalog exists |
| **Total** | **~4,000–6,000** | |

At a realistic 20–40 products per hour for structured entry from brand catalogs — slower
where specs must be read off PDFs — that is **150–300 hours**, or roughly **4–8 person-weeks**
for one person working steadily.

Plus, separately:

- **Images** — one per product minimum. Brand-supplied where permitted, otherwise sourced.
  Often the longest pole.
- **Paint shade cards** — 1,800+ rows per brand, with accurate hex values. An ingestion job,
  not data entry.
- **Stone variety list** — no published source; must be assembled from trade knowledge.

### Ongoing

| Activity | Load |
|---|---|
| Reviewing new-product requests | Scales with vendor count; heaviest in months 1–3 |
| Maintaining brand and attribute data | Low once established |
| Re-verifying prices and specs | Vendor-driven; low platform cost |

### Skills needed

Catalog seeding is **domain work, not data entry**. Deciding that a product belongs in
`Fasteners > Anchors` rather than `Fasteners > Bolts`, or that a shade card entry is a
medium base, needs someone who understands the trade. A generic data-entry resource will
produce a catalog that looks complete and matches badly.

---

## 5. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Export too large to be usable | **High** | Leaf-level + brand scoping before launch |
| Seed catalog delays vendor onboarding | **High** | Launch category by category rather than all eight at once |
| Excel corrupts codes | Medium | `GA-` prefix, quoting, UTF-8 BOM, `TRIM()` |
| Vendors ignore the export and paste their own sheet | Medium | Fuzzy ladder still exists as fallback |
| Request queue overwhelms admin | Medium | Batch review UI; auto-approve high-confidence duplicates |
| Hardware and stone data unavailable | Medium | Launch those categories later |

---

## 6. Recommendation

Adopt it — the mechanism is sound and it removes most of the wrong-match risk documented in
[catalog-consistency.md](catalog-consistency.md). Three conditions:

1. **Export scoping is not optional.** Leaf-category and brand filters ship with v1, not
   after.
2. **Do not launch all eight categories at once.** Start with two or three where brand data
   is readily available — Electrical, Tiles, Plumbing — and prove the loop end to end
   before absorbing Hardware and Stone.
3. **Budget the seed catalog as a real workstream**, with a domain-literate owner, not as a
   task attached to development.

The pre-filled export makes the *vendor's* job easy. It does so by moving that work to the
platform, and that transfer should be planned rather than discovered.

---

## Open questions

1. Is export scoping by leaf category and brand, or a search-and-select basket?
2. `.xlsx` with locked columns and dropdowns, or CSV? Locking the code column would prevent
   a whole class of error, but needs a library (`exceljs`).
3. Who owns catalog seeding, and does it start before or in parallel with development?
4. Do vendors ever get bulk price updates without re-downloading — a price-only sheet keyed
   on `product_code`?
