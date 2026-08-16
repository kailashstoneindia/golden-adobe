# Upload Templates

CSV files — Excel opens them natively; save as `.xlsx` if you prefer. Each carries a
header row plus realistic sample rows to delete before use.

Flows and validation rules: [../catalog-excel-flows.md](../catalog-excel-flows.md).

`*` in a column name = **required**.

## Admin — master catalog

Column sets differ per leaf category, because attributes differ. These four are
representative; the real system **generates** a template per category from the attribute
model, so nobody hand-maintains 58 files.

| File | Category | Shows |
|---|---|---|
| `admin-mcb.csv` | Electrical > Switchgear > MCB | Depth-3 inheritance — `poles` comes from Switchgear, `rated_current` from MCB |
| `admin-floor-tiles.csv` | Tiles > Floor Tiles | Heavy inheritance — 12 attributes from Tiles, 1 from the leaf |
| `admin-interior-emulsion.csv` | Paint > Interior Emulsion | `tinted_to_order`; **no base column, no shade column** |
| `admin-natural-stone.csv` | Stone > Natural Stone | `variety` instead of brand; `is_generic` and `has_natural_variation` set |

Column order is always: **identity → inherited attributes → leaf attributes → global**.

Not in these files, by design:

- **Manufacturer address, consumer care email and phone** — entered once per brand, not
  per row.
- **Paint shades** — no shade data exists at all ([0014](../decisions/0014-batch-resolutions.md)).
  The customer picks a colour family; the vendor finalises the exact shade at the counter.
- **Stone grade** — a vendor claim, not a catalog fact.

## Vendor — inventory

**These are exports, not blank forms.** The vendor filters by category and brand in the
portal, and downloads a sheet with `product_code` and `product_name` already filled. They
add price and quantity, delete rows they don't stock, and upload
([0011](../decisions/0011-product-code-and-vendor-export.md)).

| File | Use for | One row = |
|---|---|---|
| `vendor-inventory-general.csv` | Everything except paint and stone | one product |
| `vendor-inventory-stone.csv` | Stone | one **grade** — same product repeats per grade |
| `vendor-inventory-paint.csv` | Paint | one **colour family** — same product repeats per colour. No qty column |

**Paint prices are absolute, one per product per colour**
([0016](../decisions/0016-colour-price-per-listing.md)). No deltas, no arithmetic — the
price in the row is the price the customer pays.

The export arrives **pre-expanded**, one row per product per colour, so this is a column to
fill with fill-down and copy-paste, not 500 numbers to invent. Leave a colour row out
entirely and you simply do not offer that colour — the picker will not show it.

Untinted products (putty) leave `colour_family` blank.

`product_code` and `product_name` are **locked** — don't edit them. The code is what links
the row to the catalog; the name is only there so the row is recognisable. On import the
name is ignored, and a mismatch against the catalog raises a warning (it usually means the
wrong row was edited).

**A blank `product_code` is allowed** — the last row of the general sample shows it. Those
rows fall through GTIN → MPN → fuzzy matching, and anything unresolved goes to the admin
review queue as a new-product request. That is how a vendor adds something the catalog does
not yet have.

Rows left entirely blank (no price, no quantity) are skipped — that is the normal way to say
"I don't stock this" without deleting the row.

`pincodes` is comma-separated and must be quoted when it holds more than one value.

## Notes

- Nothing goes live on upload. Admin rows land as `draft`; vendor rows below the match
  confidence threshold land as `needs_review`.
- Re-uploading the same file updates rather than duplicates. Natural keys are
  `(vendor_id, product_ref, grade)` for vendors, and brand + part number for the catalog.
- Errors come back as the same file with an appended `error` column, so it can be fixed in
  place and re-uploaded.
- These samples are plain CSVs, so they carry no dropdowns. The real templates ship as
  `.xlsx` via `exceljs` with locked columns and dropdowns on enum fields
  ([0014](../decisions/0014-batch-resolutions.md)) — that removes a whole class of
  import error.
