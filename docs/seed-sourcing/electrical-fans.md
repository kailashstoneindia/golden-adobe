# Sourcing — Electrical > Fans

Brand shortlist for `electrical/fans`. Fetched **2026-09-08**.
Sourcing rules as per [electrical-switchgear-mcb.md](electrical-switchgear-mcb.md).

---

## What the importer requires

From `database/seed-data/taxonomy.js`:

| Attribute | Type | Required? |
|---|---|---|
| `fan_type` | enum: Ceiling, Exhaust, Wall, Pedestal, Table, Tower | ✅ **required** |
| `sweep_size` | number, mm — options `600, 900, 1200, 1400` | ✅ **required** |
| `motor_type` | enum: Induction, BLDC | ✅ **required** |
| `fan_finish` | **text** (free) | ✅ **required** |
| `power_consumption` | number, W | optional |
| `star_rating` | enum 1–5 | optional |
| `blade_count` | number | optional |
| `fan_speed` | number, RPM | optional |

---

## Brand shortlist

| Brand | Catalogue URL | Profile | Model no. | Sweep | Motor | Verified |
|---|---|---|---|---|---|---|
| **Crompton** | [crompton.co.in/collections/ceiling-fans](https://www.crompton.co.in/collections/ceiling-fans) | **C+** | ❌ | ❌ | ❌ | 2026-09-08 |
| **Orient Electric** | [orientelectric.com/collections/ceiling-fans](https://orientelectric.com/collections/ceiling-fans) | **C** | ? | ? | ? | 2026-09-08 |
| Havells | not yet located | ? | ? | ? | ? | pending |
| Usha | not yet located | ? | ? | ? | ? | pending |
| Atomberg | not yet located | ? | ? | ? | ? | pending |

---

## Findings

### Crompton — worse than Profile C

Both page types were fetched:

**Collection page** — filter/navigation UI only. No product names, no prices,
no specs. Prices confirmed INR via the "₹ From / ₹ To" filter, but no product
data is rendered server-side.

**Detail page** (`/products/crompton-luxian-statement-senze-ceiling-fan`):

| Field | Present |
|---|---|
| Product name | ✅ |
| Price (₹24,000) | ✅ |
| Colour variant | ✅ |
| Image URLs (4) | ✅ |
| Model / SKU | ❌ |
| **`sweep_size`** | ❌ **required** |
| **`motor_type`** | ❌ **required** |
| star rating, blade count, wattage | ❌ |

**Even the detail page does not yield the required attributes.** Sweep and
motor type are known from marketing copy (search surfaced "SilentPro
900–1200mm", "Energion ActivBLDC") but are not stated as spec fields on the
product page itself — writing them from marketing text would be inference,
which rule 3 forbids.

### Orient Electric — Profile C, unverified

Collection page is the same Shopify-style filter UI. A detail page from search
(`/products/wendy-antidust-48-inch-ceiling-fan`) **404'd** — the URL had moved
since indexing, so detail-page structure remains unverified.

Note the product *name* carries the sweep ("48 Inch" = 1219mm) — the same
name-encoding pattern seen in Havells MCB, and a possible extraction route.

---

## Schema fix applied: `sweep_size` option list widened

`sweep_size` was declared `number` with options **`600, 900, 1200, 1400`** —
barely half the real range. Now
`600, 750, 900, 1050, 1200, 1219, 1300, 1320, 1400`.

**Correction to an earlier claim in this file:** these values are *not*
DB-enforced. `enforce_attribute_value_option()` fires only when
`data_type = 'enum'`, and `sweep_size` is `number`, so a 1050mm fan would have
imported fine. The real impact is narrower but still real:

- the generated import template's dropdown omits the missing sizes
- `sweep_size` is `filterable`, so absent options are missing search facets

i.e. products import but become unfindable by size — a silent gap rather than
a loud rejection.

The same fix was applied to `module_size` (was `1-6`, Havells Crabtree lists up
to 18) and `current_rating` (was `6-25`, now includes 32A/45A for
heavy-appliance sockets).

Related and **not** fixed: `fan_finish` is variant-defining but typed `text`,
which decision 0013 says should be an enum. Free text in a variant-defining
field means "Bistre Brown" and "bistre brown" produce different identity
hashes. Left alone — 0013 lists several such columns and they belong in one
deliberate change, not a drive-by.

Related: `fan_finish` is variant-defining but typed **`text`**, which decision
0013 says should be an enum. Free text in a variant-defining field means
"Bistre Brown" and "bistre brown" produce different identity hashes.

---

## Assessment

Fans are **materially harder than MCB**. For MCB, one Havells fetch yielded 16
products with part numbers and 7 usable curves. For fans, neither brand
surfaces a single required attribute on either page type.

Likely routes, in order of preference:
1. **Spec sheets / PDF catalogues** — Orient publishes a
   [product catalogue page](https://orientelectric.com/pages/product-catalogue);
   likely Profile D but with real specs.
2. **BIS star-rating labels** — sweep and wattage are mandatory on the energy
   label, though not necessarily published online.
3. **Name parsing** — "48 Inch" → 1219mm. Mechanical, but only recovers sweep,
   and 1219 is not in the option list either.

**Do not seed fans from marketing copy.** "SilentPro fans have 900–1200mm
sweep" describes a *range across a product line*, not one SKU's value —
exactly the Cera failure mode, where a plausible value was inferred from
adjacent context.
