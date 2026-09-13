# Plumbing — sourcing sweep summary

4 leaves: Pipes, Pipe Fittings, Valves, Water Tanks. This pass covers
**Pipes only** (CPVC/CTS range). Fetched 2026-09-13.

---

## Result at a glance

| Leaf | Best source | Profile | Seeded this pass? |
|---|---|---|---|
| **Pipes (CPVC/CTS)** | Astral + Supreme | **B** — product-line specs confirmed, no per-SKU part codes | ✅ 24 products |
| Pipes (UPVC/PVC/SWR/PPR/GI/HDPE) | not sourced | — | ❌ |
| Pipe Fittings | not sourced (Astral fitting codes glimpsed, e.g. M342000343) | — | ❌ |
| Valves | not sourced | — | ❌ |
| Water Tanks | not sourced (Astral catalogue lists 8 tank products by name only) | — | ❌ |

---

## Brands

| Brand | Catalogue URL | Profile | Compliance | Verified |
|---|---|---|---|---|
| **Astral** | [astralpipes.com/plumbing-pipes-fittings/cpvc-pro-pipes/](https://www.astralpipes.com/plumbing-pipes-fittings/cpvc-pro-pipes/) | B | ✅ complete | 2026-09-13 |
| **Supreme** | [supreme.co.in/pipe/products?pipe_categories=plumbing](https://www.supreme.co.in/pipe/products?pipe_categories=plumbing) | C | ✅ complete | 2026-09-13 |
| Prince Pipes | princepipes.com — no fetchable contact/product data found | E | ❌ | pending |

**Astral compliance:** Astral House, 207/1, Behind Rajpath Club, Ahmedabad
380059 · info@astralpipes.com · 1800 233 7957.
Source: [astralpipes.com/contact-us/](https://www.astralpipes.com/contact-us/)

**Supreme compliance:** 612, Raheja Chambers, Nariman Point, Mumbai 400021 ·
info@supreme.co.in · 1800 3099 111 (piping-specific toll-free, used over the
generic corporate line).
Source: [supreme.co.in/contact-us](https://www.supreme.co.in/contact-us)

Both formally named `The Supreme Industries Limited` / `Astral Limited`
(formerly Astral Poly Technik Limited) — aliases seeded for both current and
legacy names in `20260913090000-seed-plumbing-brands.js`.

---

## Findings

### Astral's product catalogue page is a dead end

`astralpipes.com/catalogue/` lists 52+ product LINES by name only — no
material, size, code, or price. Real specs are gated behind "Get Instant
Access to Our Product Catalogue" (a lead-capture form) or individual product
pages. Not usable as a bulk source; had to go leaf-by-leaf via search.

### Supreme's listing page is JS-rendered for per-SKU data

`supreme.co.in/pipe/products?pipe_categories=plumbing` names 12 product
LINES with material and headline specs (pressure class, temperature rating)
in marketing copy, but the actual size/SKU filter table
("Schedule / Size (inches) / Size (mm) / Capacity / Pressure Class") does not
render in a plain fetch — same failure mode as Schneider's and Lauritz
Knudsen's storefronts in the Electrical sweep.

### What WAS usable: cross-brand-confirmed size range

Both Astral and Supreme independently state the CPVC CTS (residential
plumbing) range as **15/20/25/32/40/50mm in SDR 11 and SDR 13.5**, conforming
to IS 15778. Astral's own page additionally gives a pressure-rating table
(SDR 11: 400 psi @ 23°C; SDR 13.5: 320 psi @ 23°C), which is what let this be
seeded without per-SKU part codes — `mfr_part_number` is optional, only
`pipe_material`/`nominal_diameter`/`pressure_class` are required, and all
three are confirmed at the product-LINE level by two independent sources.

**Correction made before committing:** the CSV originally attributed SDR 11
to "Hot Water" application and SDR 13.5 to "Cold Water" — this was NOT stated
by either brand. Both market the CTS line generically as "hot & cold water"
systems; SDR only affects pressure rating, not intended water temperature.
Caught before commit and reverted to blank (`pipe_application` is optional,
so leaving it blank costs nothing and avoids stating something neither source
said).

### Astral fitting codes are real but not sourced here

Astral's catalogue page surfaced real fitting part codes in passing
(`M342000343` = Reducing Tee 110×90mm RINGFIT) while fetching pipe data. Not
built into a CSV this pass — Pipe Fittings needs its own sourcing sweep, but
this is a concrete lead for it: Astral's fittings appear to carry stable,
fetchable codes even where the pipes themselves don't.

---

## Not sourced this pass

- **Non-CPVC pipe materials** (UPVC, PVC, SWR, PPR, GI, HDPE) — `pipe_material`
  enum supports all of them; only CPVC/CTS was fetched.
- **Pipe Fittings, Valves, Water Tanks** — zero fetches. Water Tanks in
  particular is promising: Astral's catalogue names 8 tank products, likely a
  quick Profile B/C leaf given the pattern seen elsewhere.
- **Prince Pipes** — third named brand in the project's own doc, not reached.

## Cannot be verified from here

Standard commercial pipe LENGTHS (3m/5.8m/etc., which would populate
`pack_qty`) were not confirmed from either brand's page in this pass — left
blank rather than assumed from general industry knowledge.
