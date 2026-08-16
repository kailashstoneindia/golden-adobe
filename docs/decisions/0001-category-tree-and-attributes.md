# 0001 — Category tree shape, attribute inheritance, taxonomy vs. browse

- **Date:** 2026-08-02
- **Status:** Accepted
- **Supersedes / Superseded by:** —

## Context

The catalog is greenfield. Migrations so far cover only `users`, `refresh_tokens`,
`vendors` and `vendor_account_details` — no `category`, `attribute` or `master_product`
table exists yet. The draft schema in `construction-marketplace-catalog-schema-mvp (2).md`
defines `category` with a `parent_id` and hangs `attribute` off `category_id`, but says
nothing about **how deep the tree should go** or **where attributes attach**.

That gap is not cosmetic. Because attributes hang off categories, tree depth decides which
spec fields a product has. Get it wrong in either direction and the cost is real: too flat
and unrelated products are forced to share one attribute set; too deep and every common
field (`Brand`, `Warranty`) is duplicated across dozens of leaves.

Launch categories that prompted the discussion:

> electrical · plumbing · hardware tools and accessories · lights (decorative) · tiles ·
> paint shop · stone

## Options considered

### Option A — Variable depth, 2–3 levels, hard cap at 3 *(chosen)*

- **Pro:** Matches ETIM's definition of a product class — the unit that carries one fixed
  feature set. Matches the near-universal taxonomy rule that a property spanning more than
  one category is an attribute, not a category. Self-limiting: a node must justify its own
  existence, so the tree cannot grow arbitrarily.
- **Con:** The tree is uneven, so UI cannot assume a fixed nesting level. Every new
  category needs a judgment call rather than a template.

### Option B — Uniform 3 levels everywhere

- **Pro:** Predictable for breadcrumbs, navigation, and attribute placement. No judgment
  calls.
- **Con:** Infra.Market — the closest Indian comparable — runs a real building-materials
  business on **2 levels**. A mandated third level is therefore padding, producing filler
  nodes like `Stone > Natural Stone > Granite` and costing a click against the ~3-clicks-
  to-any-product consensus.

### Option C — Flat categories plus tags

- **Pro:** Simplest queries, no recursion, no depth debate.
- **Con:** Leaves nothing for attributes to be inherited *from*, killing Decision 2. A flat
  list of ~40 categories also blows past the 10–12 top-level threshold at which mobile
  navigation becomes cognitively overloaded.

## Decision

### Decision 1 — Variable depth, 2–3 levels, capped at 3

Depth follows the product, not a template. The governing test:

> A node is a **category** only if its products need a *different attribute set*. If two
> candidate children share the same fields and differ only in a value, that is an
> **attribute**, not a category.

**Level 1 is shop type.** The brief said "paint **shop**", not "paint" — level 1 mirrors
the kind of local business the seller runs, which conveniently doubles as vendor
registration scope. This is a deliberate departure from Infra.Market's project-lifecycle
top level (Structural / Finishing / Lifestyle), justified because Golden Abode's sellers
*are* local shops rather than project-supply channels.

**The resulting tree — 8 top-level categories.** Only Electrical and Hardware reach depth 3.

| Top level | Children | Depth |
|---|---|---|
| **Electrical** | Wires & Cables · Switches & Sockets · Switch Plates & Frames · Conduits & Accessories · Fans · LED Bulbs & Tubes | 2 |
| | Switchgear → MCB · RCCB · Distribution Board · Isolator | **3** |
| **Plumbing** | Pipes · Pipe Fittings · Valves · Water Tanks | 2 |
| **Sanitaryware & Bath** | Water Closets · Wash Basins · Cisterns · Urinals · Taps & Faucets · Showers · Bath Accessories | 2 |
| **Hardware Tools & Accessories** | Adhesives & Sealants · Safety & Site Equipment | 2 |
| | Hand Tools → Hammer · Spanner · Measuring Tape · Trowel … | **3** |
| | Power Tools → Drill · Angle Grinder · Circular Saw … | **3** |
| | Fasteners → Screws · Bolts · Anchors · Nails | **3** |
| | Door & Window Hardware → Locks · Hinges · Handles · Closers | **3** |
| **Lights** (decorative) | Ceiling Lights · Wall Lights · Outdoor & Garden · Lamps | 2 |
| **Tiles** | Floor · Wall · Outdoor/Parking · Elevation | 2 |
| **Paint** | Interior Emulsion · Exterior Emulsion · Enamel · Primer · Putty · Waterproofing · Wood Finish · Texture | 2 |
| **Stone** | Natural Stone · Engineered Stone | 2 |

Eight top-level categories sits at the top of the researched 5–8 range.

### Decision 2 — Attributes inherit down the tree, resolved at write time

A product's effective attribute set is the union of its own category and all ancestors.
`Brand`, `Warranty` and `Country of Origin` are defined once near the root; `Voltage` once
on Wires & Cables; only genuinely specific fields sit on leaves.

### Decision 3 — `category` is taxonomy, not the browse menu

`category` stays a stable, spec-bearing taxonomy. Merchandising groupings ("Monsoon
Essentials", "Under ₹500", festive picks) become a separate `collection` entity later.

### Supporting decisions

- **Tree storage:** `parent_id` adjacency (already in the draft schema) plus denormalized
  `level` and `path` columns. At depth ≤ 3 a closure table is unjustified.
- **Product attachment:** `master_product` attaches to **leaf categories only**. Non-leaf
  attachment makes attribute resolution ambiguous and distorts browse counts.
- **External taxonomy mapping:** treat Google / Shopify Standard Product Taxonomy as an
  *export* concern (feeds, SEO) via a nullable mapping column — never as the internal tree.

## Why

### The rule has independent corroboration

ETIM — the classification standard actually used by electrical and plumbing wholesalers
worldwide, 5,600+ classes as of ETIM 10.0 (Dec 2024), covering precisely our sectors
(electrical, HVAC/plumbing, tools/hardware, building materials) — is structured as
**Group → Class → Features**, where a Class is *defined* as the product type carrying one
fixed feature set. The general e-commerce taxonomy literature states the same test from the
other direction: a property applying to products in more than one category is an attribute.
Two separate traditions converging on one rule is why it was adopted rather than a
depth number picked by feel.

### The rule overturned two initial judgments

Both were eyeballed one way and came out the other once the test was applied. They are
recorded because they are the clearest evidence the rule does real work:

- **Stone type is an attribute, not a category.** It was initially argued that granite /
  marble / kota / sandstone should be categories, since material is the primary browse axis
  for stone. But they share slab size, thickness, finish, origin and pattern — same fields,
  different values. Only *engineered* quartz genuinely diverges (consistency guarantee,
  warranty) and earns its own category. Hence `Natural Stone` + `Engineered Stone`, depth 2.
- **Cable type is an attribute.** House wire, flexible, armoured and submersible cable all
  carry {cores, sq mm, length, voltage grade, insulation} — one `Wires & Cables` category
  with a `Cable Type` attribute, not four categories.

Where the rule *does* split: `Hammer` vs `Drill` (weight and head material vs. voltage, RPM
and chuck size); `MCB` vs `Distribution Board` (poles, breaking capacity, curve vs. ways and
IP rating). Where it explicitly does not: `Vitrified` vs `Ceramic` tile — identical fields
(size, finish, thickness, PEI, water absorption), so `Material` is an attribute.

### Why inheritance, despite ETIM not doing it

**ETIM attaches features exclusively at leaf class level, with no inheritance.** Golden
Abode deviates deliberately. ETIM's flat model is sustained by a funded international
standards body maintaining 5,600+ classes; this catalog has a single admin. Under those
conditions, duplicating `Brand` across ~40 leaves — and having to touch all 40 to change
`Warranty` — is the larger risk.

**The deviation is mitigated by resolving inheritance at write time, not read time.** The
effective attribute set is flattened when the search document is built — the same principle
`search-architecture.md` already applies to `cached_best_price`. Search and the PDP then
consume an ETIM-shaped flat list, and inheritance stays purely an authoring convenience
with no runtime join cost: one recursive CTE, at author time only.

### Why taxonomy is separated from browse

Keeping them fused means any merchandising change to the menu is a change to the spec
model, and campaign categories ("Festive Picks") end up permanently polluting the taxonomy.
Home Depot runs trade, room and project-type browse paths *in parallel* over one product
set — multiple navigation views over a single taxonomy is the mature pattern, not
over-engineering.

This also resolves a genuine tension that Decision 1 creates. Decorative Lights and Stone
are bought **visually** — people browse chandeliers by form, not by spec fields — but the
depth rule deliberately flattens exactly those categories. Collections absorb this: a
visual "Chandeliers" browse tile pointing into `Ceiling Lights`, with no taxonomy
pollution. The three decisions interlock rather than merely coexisting.

## Consequences

### Boundary rulings settled here

- **LED bulbs & tubes → Electrical**, not Lights. They are electrical-shop stock bought by
  spec (wattage, cap type, lumens, colour temperature). Lights stays purely decorative and
  fixture-led.
- **Sanitaryware → its own 8th top-level category**, not a child of Plumbing, reflecting
  that Indian sanitaryware showrooms are typically separate businesses from plumbing-supply
  shops. This matters because level 1 doubles as vendor registration scope.
- **The Plumbing / Sanitaryware dividing line: Plumbing is what's behind the wall;
  Sanitaryware & Bath is what you see and touch.** Pipes, fittings, valves and tanks stay
  in Plumbing; taps, showers and bath accessories sit with WCs and basins. This is
  low-risk because vendor↔category is many-to-many — a shop selling both simply registers
  for both, so the taxonomy never has to match any one shop's inventory exactly.
- **Tile adhesive & grout → Hardware > Adhesives & Sealants**, giving all chemicals one
  attribute set (pack size, base, coverage, cure time) rather than splitting adhesives
  across two categories with duplicated attributes.

### Knock-on effects

- Promoting Sanitaryware to top level removed Plumbing's only depth-3 branch. **Plumbing is
  now entirely depth 2**, and only Electrical and Hardware reach depth 3 at all. The final
  tree is therefore shallower than first sketched, landing closer to Infra.Market's actual
  2-level structure.
- The admin UI cannot assume a fixed nesting depth when rendering the category picker.
- Resolving a product's attribute set requires walking ancestors — a recursive CTE. This is
  confined to authoring and to search-document builds; no read path should ever do it.
- Adding a category is now a decision, not data entry: someone must apply the rule and be
  able to justify the answer. The worked examples above exist to make that reviewable.

## Open questions

Deliberately not settled here:

1. **Paint shade** — the tinting-machine problem. Shade is an order-time input against a
   base, not a SKU-splitting variant; treating it as a variant explodes SKUs per colour.
   The draft schema's `attribute_value_option` assumes a finite enum set, which shade
   breaks. Needs its own record.
2. **Stone as a natural, lot-varying material** — granite varies lot to lot in a way TMT
   bars do not. Affects whether pricing and imagery are indicative or exact-match, and
   whether strict vendor-listing dedup is even meaningful for this category.
3. **The concrete attribute list per category**, with `is_variant_defining` and
   `is_searchable_filter` set per attribute, and which level of the inheritance chain each
   attribute sits at.
4. **When `collection` gets built.** Decision 3 defers it, but Lights and Stone browse
   quality depends on it, so it may be needed earlier than "later" implies.

## Sources

- [ETIM (standard) — Wikipedia](https://en.wikipedia.org/wiki/ETIM_(standard))
- [ETIM Classification: Classes, Codes & Technical Attributes Explained — WisePIM](https://wisepim.com/guides/product-taxonomy/etim)
- [ETIM Classification: How It Works — AtroPIM](https://www.atropim.com/en/blog/etim)
- [Infra.Market product catalogue](https://infra.market/catalogue/)
- [How to Categorize Products for Home Depot](https://www.productcategorization.com/how-to-categorize-products-for-Home-Depot.php)
- [Introducing Shopify's Standard Product Taxonomy](https://www.shopify.com/blog/shopify-taxonomy)
- [Google Product Category: The Complete Taxonomy Guide — Marpipe](https://www.marpipe.com/blog/google-product-category)
- [Product Taxonomy: A Complete Guide — Bloomreach](https://www.bloomreach.com/en/blog/product-taxonomy)
- [The Ultimate Guide to Taxonomy and Attribution in eCommerce — Start with Data](https://startwithdata.co.uk/insight/the-ultimate-guide-to-taxonomy-and-attribution-in-ecommerce/)
