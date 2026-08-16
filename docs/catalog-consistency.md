# Catalog ↔ Inventory Consistency

How other platforms stop a vendor's listing attaching to the wrong catalog product, and
what Golden Abode should adopt.

## The failure

```
Vendor writes:  "Havells 32A MCB"
Catalog has:    Havells 32A MCB C-Curve   ← matcher picks this
                Havells 32A MCB B-Curve   ← vendor meant this

Customer buys C-curve → receives B-curve
```

The damage is asymmetric: the vendor is paid, the customer is wrong, and the platform
carries the dispute. Nothing in the data looks broken afterwards — the listing is valid, the
price is sane, the stock is real. Only the *link* is wrong.

---

## How others solve it

### 1. Amazon — refuse to guess

Amazon does not fuzzy-match sellers onto catalog products. A listing feed either resolves by
identifier or it **fails at ingest with a specific error code**:

| Code | Meaning |
|---|---|
| 8005 | Product information conflicts with how Amazon identifies the item |
| 8541 | Your UPC is already assigned to a *different* product |
| 8560 / 8572 / 8573 | Duplicate or inconsistent feed values |
| 8574 | Invalid ASIN |

Sellers are told to confirm the identifier is "the exact GTIN that appears on the product's
barcode". Ambiguity is escalated to Seller Support — a human — rather than resolved
statistically.

**The principle: block at the door, don't publish and hope.** A rejected row costs the
seller ten minutes. A wrongly matched row costs a customer their order.

### 2. Master Data Management — the golden record and the steward

This is the discipline B2B distributors use, and it describes what Golden Abode is actually
building. `master_product` is a **golden record**; vendor uploads are **source records**.

The standard pattern:

1. **Identity resolution** across incoming feeds
2. **Merge into golden records with full provenance** — you can always trace a value back
   to who supplied it
3. **Normalise attributes** to a consistent schema
4. Records that cannot be auto-resolved **route to a data steward**

The steward's screen is the important detail. It shows **candidate pairs, match probability,
conflicting values, and a recommended resolution** — not merely a flag saying "needs
review". The reviewer is choosing between ranked options, not investigating from scratch.

Distributors treat duplicates as the core risk: without governance "an industrial
distributor might carry one bearing under different SKU variations with different pricing
and classifications". The recommended controls are strict product-creation rules, matching
on manufacturer part number, and approval workflows.

Poor data quality is estimated to cost organisations ~$12.9M annually on average.

### 3. Mirakl — anomaly detection after publish

Mirakl (marketplace platform software) runs ML price-anomaly detection across marketplace
and dropship catalogs, catching "accidental decimal point errors or attempts at price
manipulation *before they impact your business*".

**Why this matters for matching, not just pricing:** a wrongly matched product almost always
presents as a price outlier. A ₹4,200 paint bucket matched onto a ₹420 MCB is visible
without knowing anything about MCBs.

```
Vendors on this master_product:  420   418   425   ⚠ 4200
```

This is the cheapest high-yield check available, and it needs no machine learning at MVP —
a simple deviation threshold against sibling listings catches the large majority.

### 4. Common to all three

- **Identifier beats text.** GTIN/MPN resolve deterministically; names never do.
- **Provenance is kept.** The original supplied row survives, so any decision is auditable.
- **Humans resolve ambiguity**, machines resolve certainty.

---

## What Golden Abode already has

| Mechanism | Where |
|---|---|
| Match confidence + method | `catalog_import_row.match_confidence`, `match_method` |
| Review queue | `status = 'needs_review'` |
| Full provenance | `catalog_import_row.raw_row_json` |
| Alias learning | `stone_variety_alias` |
| No duplicate listings | `UNIQUE (vendor_id, master_product_id, grade)` |

The bones are right — this is the Amazon/MDM shape. Four gaps remain.

---

## Gaps and recommended fixes

### Gap 1 — the mapping is not remembered

`vendor_sku` is stored on `vendor_listing` but never used as a key. Every upload re-runs the
matcher over the same rows, so a row that matched correctly in March can match differently
in April if the catalog has grown.

**Fix — a persistent vendor↔catalog map.** After one confirmed match, the vendor's own code
becomes authoritative for that vendor:

```sql
vendor_product_map (
  vendor_id,
  vendor_sku,                -- the vendor's own code
  master_product_id,
  confirmed_by,              -- vendor | admin
  confirmed_at,
  PRIMARY KEY (vendor_id, vendor_sku)
)
```

Match order gains a step 0: **exact hit on `vendor_product_map` → done, no guessing.**

This is the single highest-value fix. It converts matching from a repeated statistical
problem into a one-time one, and it mirrors how Amazon expects a seller SKU to map stably to
one ASIN.

### Gap 2 — the vendor never confirms

Rows are matched and published without the one person who knows what they meant ever seeing
the result.

**Fix — confirm on first match only.** The vendor sees "we matched *your* `HAV-32C` to
**Havells 32A SP MCB C-Curve**" and accepts or rejects. Confirmation writes
`vendor_product_map`, so it is asked once per SKU, not once per upload.

Rejection is valuable data: it feeds the review queue and should teach the matcher.

### Gap 3 — the review queue is a flag, not a decision screen

`status = 'needs_review'` tells an admin something is wrong but not what to do. Per the MDM
pattern, a steward needs ranked candidates.

**Fix — store the candidates, not just the verdict:**

```sql
catalog_import_row.match_candidates  JSONB
-- [ {master_product_id, score, matched_on, differing_attributes}, … ]
```

The reviewer picks from a ranked list showing *why* each candidate matched and *how* it
differs. Every manual resolution writes back an alias or a `vendor_product_map` row, so the
same decision is never made twice.

### Gap 4 — no detection after go-live

Once a listing is live, a wrong match is invisible until a customer complains.

**Fix — two cheap checks:**

- **Price outlier** against sibling listings on the same `master_product`. Flag, don't
  auto-unpublish — legitimate outliers exist, particularly stone grades.
- **Re-validation on catalog edit.** When an admin changes a variant-defining attribute,
  every attached listing is now describing something subtly different. `catalog_reindex_queue`
  already has exactly this invalidation shape and can carry the flag.

---

## Recommended layering

```
UPLOAD
  │
  ├─ 0. vendor_product_map exact hit ──────────────► link, done
  ├─ 1. GTIN exact ───────────────────────────────► link
  ├─ 2. brand + MPN exact ────────────────────────► link
  ├─ 3. structured (brand + category + variants) ─► link if confident
  ├─ 4. fuzzy name ───────────────────────────────► CANDIDATES → review
  └─ 5. no match ─────────────────────────────────► new product request
                                                        │
  FIRST TIME ONLY: vendor confirms ◄────────────────────┘
                          │
                          └──► writes vendor_product_map (never re-guessed)

LIVE
  ├─ price outlier vs siblings ──► flag for admin
  └─ admin edits catalog spec ───► re-validate attached listings
```

Steps 0–2 are deterministic and safe to auto-publish. Steps 3–4 should not publish without
confirmation. Step 5 is the existing product-request flow.

**Stone is the hard case**: no GTIN, no MPN, so steps 1–2 never fire and everything lands at
step 3 or below. This is why `vendor_product_map` matters most there — after one confirmation
a yard's `BG-18-A` maps permanently to Black Galaxy Polished 18mm, and the fuzzy matcher is
never consulted again.

---

## Open questions

1. **Auto-publish threshold for step 3.** Too permissive fragments the catalog; too strict
   buries the admin.
2. **Does a vendor confirm in-app, or in the returned error file?** They live in Excel.
3. **Price-outlier threshold** — a fixed percentage band, or standard deviations against
   siblings? Stone grades and paint colour families will produce legitimate spread.
4. Whether a **customer-facing "report wrong product"** path is needed at MVP, as the final
   safety net.

## Sources

- [How to solve Amazon listing matching errors — eComEngine](https://www.ecomengine.com/sell-on-amazon/amazon-listing-matching-errors)
- [Managing UPC/ASIN mismatches — Inventory Source](https://help.inventorysource.com/article/110-amazon-getting-started-and-managing-upc-asin-mismatches)
- [Amazon listing errors guide](https://amzprep.com/amazon-listing-errors-guide/)
- [Golden record management — Profisee](https://profisee.com/platform/golden-record-management/)
- [Product data governance for distributors — Pimberly](https://pimberly.com/blog/product-data-governance-distributor-best-practices/)
- [Master data management & entity resolution](https://xylitytech.com/data-engineering/master-data-management-entity-resolution/)
- [How Mirakl leverages AI for price management](https://www.mirakl.com/blog/how-mirakl-leverages-ai-for-price-management)
- [A marketplace price anomaly detection system at scale (arXiv)](https://arxiv.org/pdf/2310.04367)
