# Sourcing — Electrical > Switches & Sockets

Brand shortlist for `electrical/switches-sockets`. Fetched **2026-09-08**.
Sourcing rules as per [electrical-switchgear-mcb.md](electrical-switchgear-mcb.md).

---

## What the importer requires

All five are variant-defining → **all required**:

| Attribute | Type |
|---|---|
| `device_type` | enum |
| `module_size` | number, modules |
| `current_rating` | number, A |
| `series` | **text** (free) |
| `finish` | enum |

---

## Brand shortlist

| Brand | Catalogue URL | Profile | Part no. | Module | Rating | Series | Finish | Images |
|---|---|---|---|---|---|---|---|---|
| **Havells Crabtree** | [havells.com/crabtree/switches.html](https://havells.com/crabtree/switches.html) | **A** ⭐ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Anchor / Panasonic | [lsin.panasonic.com/switches-sockets](https://lsin.panasonic.com/switches-sockets) | **D** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Legrand | pending | ? | | | | | | |
| Schneider | pending | ? | | | | | | |
| GM Modular | pending | ? | | | | | | |

---

## Findings

### Havells Crabtree — Profile A ⭐ the best source found so far

**782 products**, ~16 per page across 5+ pages. The listing page carries
**every required attribute**, plus image URLs:

```
"Magnus 6 A Flat Switch White"   part: acgzpxw061
  current_rating  6A          ✅
  module_size     1–18        ✅
  series          Magnus, Adiva, Signia, Athena   ✅
  finish          White, Grey, Black              ✅
  image URL       visible                         ✅
```

This is the only source in the sweep so far where a category can be seeded
**without per-product fetches**. Cost is ~5 paginated fetches for 782 products,
versus 782 detail-page fetches elsewhere.

Contrast with `docs/seed-samples/havells-switches-sockets.csv` from the
2026-08-24 attempt, which captured **0 part numbers** — that pass used a
different Havells listing page. The Crabtree path is materially better and
supersedes it.

> Note: "Crabtree" is a Havells sub-brand. Decide whether it seeds as its own
> `brand` row or as an alias of Havells — see aliases below.

### Anchor / Panasonic — Profile D

`lsin.panasonic.com/switches-sockets/roma/roma-classic` lists only the four
range names (Switch, Socket, Fan Regulator, Support Function). No part numbers,
no module sizes, no current ratings, no finishes. The page says *"Download our
brochure to get all the details"* — specs are PDF-only.

---

## PDF price lists — a lead worth pursuing

Havells publishes dated price lists and catalogues as PDFs on its own domain:

- [Catalogue_Havells_Crabtree_Switches.pdf](https://havells.com/media/wysiwyg/Brochure-and-pricelist/Switches/Catalogue_Havells_Crabtree_Switches.pdf) — 2025 collection
- [Havells_Crabtree_Switches_Combined_Popular.pdf](https://havells.com/media/wysiwyg/Brochure-and-pricelist/Switches/Havells_Crabtree_Switches_Combined_Popular.pdf) — **List Price w.e.f. 01 April 2026**

A dated price list is structured catalogue data — codes, descriptions, MRP —
usually more complete than the website. Worth testing as the primary source for
brands whose sites are Profile C/D, rather than treating PDF as a last resort.

---

## Alias note

| Canonical | Aliases |
|---|---|
| Anchor by Panasonic | `Anchor`, `Panasonic` |
| Havells *(if Crabtree folds in)* | `Crabtree`, `Havells Crabtree` |

Crabtree is a real decision, not a formality: if seeded as its own brand it
needs its own Legal Metrology fields; if an alias, every Crabtree product
carries `brand = Havells`. Vendors will type both.
