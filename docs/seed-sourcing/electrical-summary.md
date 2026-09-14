# Electrical — sourcing sweep summary

All 10 leaves of `electrical/`, swept **2026-09-08**. Sourcing rules in
[electrical-switchgear-mcb.md](electrical-switchgear-mcb.md).

Per-leaf detail: [MCB](electrical-switchgear-mcb.md) ·
[Switches & Sockets](electrical-switches-sockets.md) · [Fans](electrical-fans.md)

---

## Result at a glance

| Leaf | Best source | Profile | Seedable from listing? |
|---|---|---|---|
| **Switches & Sockets** | Havells Crabtree | **A** ⭐ | ✅ all 5 required attrs + part no. + images |
| **LED Bulbs & Tubes** | Havells Lighting | **A−** | ✅ 3 of 4; part code in URL |
| **Wires & Cables** | Havells Flexible Cables | **B+** | ⚠️ 3 of 4; part code on detail page |
| **Switchgear / MCB** | Havells | **B** | ⚠️ curve only where in product name |
| **Switchgear / RCCB** | Havells | **B−** | ❌ `sensitivity` (mA) missing |
| Switch Plates | (Havells Crabtree — same catalogue) | likely **A** | not separately verified |
| Conduits | not swept | ? | — |
| Switchgear / Distribution Board | Havells | ? | listing shows category only |
| Switchgear / Isolator | Havells | ? | not listed on switchgear page |
| ~~Fans~~ | — | **C+** | ⛔ **dropped** — see below |

**Havells is the single best source for Electrical.** It is the only brand
covering every leaf with a fetchable India catalogue that exposes part numbers.

---

## Per-leaf findings

### Switches & Sockets — Profile A ⭐

[havells.com/crabtree/switches.html](https://havells.com/crabtree/switches.html)
— **782 products**, all five required attributes on the listing page, plus part
numbers and image URLs. ~5 paginated fetches for the whole category. Best
source found in the entire sweep.

### LED Bulbs & Tubes — Profile A−

[havells.com/lighting/lighting-led-lamps.html](https://havells.com/lighting/lighting-led-lamps.html)
— 36 products / 3 pages. Product names encode most of what's required:

```
"Classy Plus LED 17 W B22 CDL Lamp"   URL: …-lhlddnenwl8r017.html
   wattage          17 W    ✅ (required)
   cap_base_type    B22     ✅ (required)
   colour_temp      CDL     ✅ (required — 6500K)
   lamp_type        Lamp    ✅ (required)
   luminous_flux    —       optional, absent
   part code        lhlddnenwl8r017  ← extractable from URL
```

⚠️ `colour_temperature` is required and published as **CDL / WW**, not Kelvin.
A mapping is needed (CDL = 6500K, WW ≈ 3000K) — and mapping is inference
unless the option list itself uses CDL/WW. Check the declared options before
seeding.

### Wires & Cables — Profile B+

[havells.com/home-electricals/flexible-cables.html](https://havells.com/home-electricals/flexible-cables.html)
— 45 products. Listing gives name, `conductor_size`, `number_of_cores`,
insulation (HRFR/FR/FR-LSH), length, ₹ price, image URLs.

**`conductor_material` (required) is absent** from the listing, and part codes
(`WHFFDNKA1X50`) appear only on detail pages — though they are also embedded in
product URLs, which may avoid per-product fetches.

Supersedes the 2026-08-24 sample, which captured only 1 of 4 part numbers.

Polycab was checked and is **worse**: its `/products/wires` page showed full
part codes for two *featured* products only; the general listing has no codes,
cores, material, insulation or voltage grade. My earlier note calling Polycab
"Profile A" was wrong — corrected here.

### Switchgear / MCB — Profile B

See [detail](electrical-switchgear-mcb.md). 16 products with part numbers on
one page; `tripping_curve` readable only where the product name states it
(7 of 16). The 9 X7-series rows need detail pages.

### Switchgear / RCCB — Profile B−

[havells.com/home-electricals/switchgears.html](https://havells.com/home-electricals/switchgears.html)
lists RCCBs (EURO2 D7, 25/32/40/63A, DP and FP) with ratings and poles, but
**`sensitivity` in mA is required and not shown** — nor are part numbers.
Detail pages needed.

### Distribution Board / Isolator — unresolved

The switchgear page lists Distribution Board as a sub-category but shows no DB
products; isolators do not appear at all. Both need their own category URLs,
not yet located.

### Conduits — not swept

No fetches attempted. Likely brands: Astral, Precision, AKG, Polycab.

---

## Fans — dropped

Removed from scope at the user's direction (2026-09-08). Neither Crompton nor
Orient exposes `sweep_size` or `motor_type` on listing *or* detail pages, and
the only available values sit in marketing copy describing ranges across a
product line — inference, which rule 3 forbids.

[Detail retained](electrical-fans.md) for whenever fans are revisited.

---

## Schema fix applied

Sourcing evidence showed three numeric option lists were far short of the real
market range. Fixed in `database/seed-data/taxonomy.js` and re-seeded (13 new
options, 930 → 943):

| Attribute | Was | Now | Evidence |
|---|---|---|---|
| `sweep_size` | 600, 900, 1200, 1400 | + 750, 1050, 1219, 1300, 1320 | Crompton Luxian = 1320mm |
| `module_size` | 1–6 | + 8, 9, 10, 12, 16, 18 | Havells Crabtree listing |
| `current_rating` | 6–25 | + 32, 45 | heavy-appliance sockets |

**These were never DB-rejected.** `enforce_attribute_value_option()` fires only
for `data_type = 'enum'`; all three are `number`. The real damage was quieter —
missing template dropdown entries, and missing search facets on `filterable`
attributes. Products would import and then be unfindable by size.

The seeder's `ON CONFLICT DO NOTHING` was also changed to
`DO UPDATE SET display_order`: inserting 750 and 1050 mid-list left the older
rows on their original indices, rendering the dropdown as
`600, 900, 750, 1200…`. Verified corrected; frozen suite 25/25 green.

---

## Brands seeded (2026-09-08)

`20260908090000-seed-electrical-brands.js` — **4 brands, 15 aliases**, both dev
and test DBs. Idempotent on the normalized name; re-running inserts 0.

| Brand | Compliance source |
|---|---|
| Havells | havells.com/contact-us |
| Crabtree | Havells' details (Havells India Ltd is the manufacturer) |
| Legrand | legrand.co.in/contact-us |
| Polycab | polycab.com/contact-us/support |

**Not seeded** — Schneider (address resolved only to "Gurgaon 122002", and
`manufacturer_address` is NOT NULL, so it was not guessed), Lauritz Knudsen,
Anchor/Panasonic. Listed in the seeder's footer with what is still missing.

Crabtree is seeded as its **own brand row**, not a Havells alias: an alias
would force every Crabtree product to carry `brand = Havells`, losing the
distinction printed on the box.

### ⚠️ The CSV `brand` column must be the EXACT canonical name

Verified against the live DB: the importer's Rule 4 is
`Brand.findOne({ where: { name } })` — an **exact match that never calls
`BrandResolverService`**. The aliases are therefore invisible to Excel import:

| Typed in CSV | Resolver would give | Importer Rule 4 |
|---|---|---|
| `Havells` | Havells | ✅ OK |
| `HAVELLS` | Havells (normalized) | ❌ **REJECTED** |
| `Havells India Ltd` | Havells (alias) | ❌ **REJECTED** |
| `Havells Crabtree` | Crabtree (alias) | ❌ **REJECTED** |

So aliases earn their keep on the **vendor** upload path (match ladder), not on
admin catalog import. Product CSVs must spell the brand exactly:
`Havells`, `Crabtree`, `Legrand`, `Polycab`.

This is a pre-existing inconsistency — `brand-resolver.service.ts` states every
entry point "should resolve through here instead", and this one does not.
Recorded, not silently fixed: routing Rule 4 through the resolver changes
import behaviour and belongs in its own change.

### Normalizer is weaker than documented

`normalize_brand_name()` strips only **one** trailing token, verified live:

```
'Havells'            -> 'havells'
'Havells India Ltd'  -> 'havells india'    ← NOT 'havells'
'Legrand India'      -> 'legrand'
```

So `idx_brand_normalized_name_unique` would **not** stop "Havells" and
"Havells India Ltd" existing as two brand rows. Explicit aliases are the real
protection, which is why both `ltd` and `limited` spellings are listed.

---

## Still open

1. **`conductor_material`** for wires and **`sensitivity`** for RCCB are
   required but unpublished on listing pages — both need detail-page fetches.
2. **DB / Isolator / Conduits** category URLs not located.
3. **Non-Havells brands barely covered.** Legrand, Schneider, Anchor, Polycab
   were each checked in one leaf. A master catalog wants breadth — but Havells
   alone can carry a working first import.
4. ~~**Part-codes-in-URLs**~~ — **tested 2026-09-08, does not work.** See below.

---

## Tested and rejected: part codes from listing-page URLs

The idea was that Havells embeds real part codes in product URLs
(`…-lhlddnenwl8r017.html`), so `mfr_part_number` could be harvested from the
listing page's own links — turning Profile B into Profile A with no
per-product fetches.

**It is not reliable.** Both listings were fetched for their raw hrefs:

| Listing | URLs with a part code | URLs that are plain name slugs |
|---|---|---|
| LED lamps | **2 of 16** | 14 |
| Flexible cables | **8 of 16** | 8 |

```
whffdnka12x5-c.html                 ← code ✅
lifeline-fr-2-5-sq-mm-180-m.html    ← slug ❌  (same page, same product line)
```

The pattern is inconsistent *within a single listing*, so it cannot be applied
as a rule. Where I previously saw codes, they came from **search-result URLs**
pointing at different variants of the same product — not from the listing page.

**Consequence:** `mfr_part_number` needs detail-page fetches after all, for
every leaf except Switches & Sockets (where Crabtree prints codes directly on
the listing). Profile B stays Profile B.

Worth noting the partial win: for the ~50% of wire URLs that do carry a code,
harvesting is free. A hybrid — take codes from URLs where present, fetch detail
pages only for the remainder — roughly halves the fetch count for wires. But it
must be driven by *what the URL actually contains*, never assumed.
