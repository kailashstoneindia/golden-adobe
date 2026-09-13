# Sourcing — Electrical > Switchgear > MCB

Brand shortlist for seeding `electrical/switchgear/mcb`. **Nothing here is
product data** — this records which brands publish usable catalogue data, at
what cost, so the seeding owner can budget before committing.

Fetched **2026-09-08** unless stated. Catalogue pages change; re-verify before
relying on a profile.

## Sourcing rules

1. **India sources only.** `.co.in`, `se.com/in/`, or an India-specific
   storefront. A brand's global catalogue is NOT acceptable: part numbers,
   ratings and certifications differ between ranges, and a global code for a
   product never sold here silently breaks match-ladder step 2 later.
   Verified: `shop.legrand.co.in` prices in ₹ (₹446, ₹267), Mumbai address.
2. **Brand's own domain only.** No resellers, no aggregators — the Asian
   Paints failure (pack prices from nobroker.in / aapkapainter.com) must not
   recur. IndiaMART, Amazon and dealer sites are not sources.
3. **Never infer.** A blank cell is honest; a guessed one corrupts the catalog
   silently when the field is variant-defining.
4. **Record `image_url`, do not serve it.** Capture the brand's own image URL
   per product while already on the page — re-visiting hundreds of pages later
   purely for images is the expensive alternative, and once products are in the
   DB the CSV is gone as a working document, leaving fuzzy name-matching as the
   only way back. Recording a URL creates no rights exposure; **serving** it
   would be hotlinking (their bandwidth, no consent, breaks silently when they
   reorganise). Pre-launch this is reference data only.

   `master_product_media.url` is plain TEXT with no constraint, so the eventual
   swap to an S3/CDN URL is a one-column UPDATE — nothing downstream reads
   anything but `url`.

   Sequence: record URL → build workstream 3 (S3 + admin upload) → obtain brand
   permission (parallel; real lead time) → download from the recorded URL and
   rehost. Step 4 is scriptable *because* step 1 recorded the URLs.

   > ⚠️ `master_product_media` has **no `source_url` column**. Add one in
   > workstream 3's migration, or a rehosted image becomes indistinguishable
   > from a hotlinked one and failed downloads cannot be retried.

---

## What the importer requires

From `database/seed-data/taxonomy.js` — variant-defining attributes are
**required**; a blank one gets the row rejected
(`catalog-import-upload.service.ts` Rule 1).

| Attribute | Source | Required? |
|---|---|---|
| `number_of_poles` | inherited from Switchgear | ✅ required |
| `rated_current` | MCB leaf | ✅ required |
| `tripping_curve` | MCB leaf | ✅ required |
| `breaking_capacity` | inherited | optional |
| `mounting` | inherited | optional |

Plus identity columns `name`, `brand`, `gst_rate`, `country_of_origin` — all
required — and optional `mfr_part_number`, `gtin`, `hsn_code`, `pack_qty`.

**`tripping_curve` is the deciding field.** It is required, and it is the one
most brands omit from listing pages. Whether a brand exposes it determines
whether that brand can be seeded from one page or needs one fetch per product.

---

## Brand shortlist

| Brand | Catalogue URL | Profile | Part no. | Curve | Verified |
|---|---|---|---|---|---|
| **Havells** | [circuit-breaker.html](https://havells.com/home-electricals/switchgears/circuit-breaker.html) | **B** | ✅ listing | ⚠️ name only | 2026-09-08 |
| **Legrand** | [shop.legrand.co.in/protection/dx3](https://shop.legrand.co.in/protection/dx3/miniature-circuit-breaker-mcb) | **B** | ❌ detail | ⚠️ name only | 2026-09-08 |
| **Schneider** | [se.com/…/acti-9](https://www.se.com/in/en/product-subcategory/1605-miniature-circuit-breakers-mcbs-acti-9/) | **C/D** | ❌ | ❌ | 2026-09-08 |
| **Lauritz Knudsen** (ex-L&T) | [smartshop.lk-ea.com/…/exora/mcb](https://smartshop.lk-ea.com/shop-by-category/final-distribution-products/exora/mcb.html) | **?** | ? | ? | blocked |
| Siemens (Betagard) | not located | ? | ? | ? | pending |
| ABB (SH200) | not located | ? | ? | ? | pending |

**Profiles:** A = codes+specs on listing · B = partial, some attrs in product
*names* · C = specs on detail pages only · D = PDF brochure only ·
E = unreachable

---

## Per-brand findings

### Havells — Profile B · best available

16 MCBs on one listing page, **all with part numbers** (`DHMGCSPF032`,
`DHMYBSPM006`, …), current rating and poles.

`tripping_curve` is **not a spec field**. It appears only where the product
*name* contains it:

```
"MCB SP C Curve"   DHMGCSPF032   → curve C readable from the name   (7 rows)
"X7 MCB SP"        DHMYBSPM006   → curve NOT stated anywhere        (9 rows)
```

This independently reproduces the gap in
`docs/seed-samples/havells-mcb.csv`, where 9 of 16 rows have a blank
`tripping_curve` — those are exactly the X7 rows. `breaking_capacity` is
absent for all 16 (optional, so harmless).

**Cost:** 1 fetch → 7 importable rows. The other 9 need 9 detail-page fetches
to obtain the curve.

### Legrand — Profile B

DX3 range, 223 products. Poles / current / curve are encoded in product names
(`"SP C3A AC MCB"`), but **catalogue numbers and breaking capacity are not on
the listing page** — those require detail pages.

Legrand also publishes a **global** e-catalogue carrying real reference
numbers (`legrand.com/ecatalogue/…`). **Do not source from it.** It is not the
India range: part numbers, ratings and certifications can differ between the
European and Indian line-ups, and `mfr_part_number` drives match-ladder step 2
— a global code for a product never sold in India would silently break vendor
matching later. India catalogue numbers must come from an India source, even
if that costs per-product fetches.

### Schneider Electric — Profile C or D, not yet distinguished

`se.com/in/…/acti-9` is **informational only** — explains what an MCB is, lists
no SKUs. `shop.schneider-electric.co.in` returned empty (JS-rendered; not
readable by plain fetch).

Schneider does publish full PDF catalogues
([Acti9K India Catalog](https://www.se.com/in/en/download/document/Acti9K-India-Catalog/)),
so the data exists — but as PDF, which is Profile D and a different extraction
job.

### Lauritz Knudsen (formerly L&T Switchgear) — blocked

`smartshop.lk-ea.com` returned empty content on fetch. Product names visible
via search carry codes (`BB10160C` = Exora 16A SP C-curve), suggesting the data
is there but the storefront is JS-rendered.

> ⚠️ **Brand rename.** L&T Switchgear is now *Lauritz Knudsen Electrical &
> Automation*. Vendors will type "L&T" for years. See aliases below.

### Siemens / ABB — not yet located

Both sell MCBs in India (Siemens Betagard, ABB SH200). Neither official India
product page located yet; search surfaced mostly resellers and PDF datasheets.
Deliberately **not** recorded from reseller sources.

---

## Brand compliance fields

`brand.model.ts` makes `manufacturer_address`, `consumer_care_email` and
`consumer_care_phone` **NOT NULL** (Legal Metrology, decision 0010), and the
importer rejects products whose brand row does not exist. So these gate all
product seeding.

### Havells ✅ complete
```
manufacturer_name    Havells India Ltd
manufacturer_address QRG Towers, 2D, Sec-126, Expressway, Noida 201304, U.P.
consumer_care_email  customercare@havells.com
consumer_care_phone  08045771313
source               https://havells.com/contact-us
```

### Legrand ✅ complete
```
manufacturer_name    Legrand India
manufacturer_address 61 & 62, 6th Floor, Kalpataru Square, Kondivita Road,
                     Off Andheri-Kurla Road, Andheri (E), Mumbai 400059
consumer_care_email  customer.care@legrand.co.in
consumer_care_phone  022-30416200
source               https://www.legrand.co.in/contact-us
```

### Schneider / Lauritz Knudsen / Siemens / ABB — pending

---

## Aliases to seed

`brand_alias` is matched **first** by `BrandResolverService`, so these must be
deliberate, not discovered later (Phase 7 risk 1).

| Canonical brand | Aliases |
|---|---|
| Lauritz Knudsen Electrical & Automation | `L&T`, `L&T Switchgear`, `Lauritz Knudsen` |
| Anchor by Panasonic | `Anchor`, `Panasonic` |

⚠️ `idx_brand_normalized_name_unique` is a functional unique index over
`normalize_brand_name()`, which strips `pvt ltd|ltd|limited|india|electricals?`.
Seeding "Havells" **and** "Havells India Ltd" as two rows fails at the DB
level. One canonical row per brand, everything else an alias.

---

## Honest assessment

**No brand here is Profile A for MCB.** `tripping_curve` — a required field —
is not published as a spec on any listing page checked. Best case (Havells)
yields 7 importable rows from one fetch; the rest need per-product fetches.

Two method notes, both learned the hard way:

1. **Guessed URLs 404 often.** 3 of 8 tried failed
   (`havells.com/en/consumers/products/switchgear/mcb.html`,
   `havells.com/en/customer-care.html`, `finolex.com/product-category/…`).
   Search scoped to the brand's own domain, then fetch.
2. **JS-rendered storefronts return empty**, not an error — Schneider's and
   Lauritz Knudsen's shops both did. An empty result is not evidence the data
   is absent.

### Cannot be verified from here

**Which brands the NCR vendors actually stock.** This list means *"publishes
usable data"*, not *"sells well in NCR"*. Catalogue pages state no regional
availability, and this needs confirming against real vendor demand before
anyone spends days seeding a brand nobody carries.
