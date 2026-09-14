# Hardware Tools & Accessories — sourcing summary

19 leaves total. This pass covers **2**: Adhesives & Sealants, Safety & Site
Equipment. Fetched 2026-09-14.

Per the project's own docs (`catalog-vendor-export-analysis.md` §4), Hardware
is the worst-rated category for data availability — *"Poor — highly
fragmented, many unbranded"* — and the largest by leaf count (19, more than
double any other category). This pass deliberately took only the two
cheapest leaves (3 required fields each) as a foothold rather than attempting
the other 17, consistent with the breadth-first approach adopted this
session: try once with real evidence, seed what clears, log the rest rather
than grinding a category the project's own analysis already flagged as poor
value for the effort.

---

## Seeded

| Leaf | Brand | Products |
|---|---|---|
| Adhesives & Sealants | Roff (Pidilite) | 2 — Vitrofix Tile Adhesive, Grey and White |
| Safety & Site Equipment | Karam | 1 — Safety Helmet with Textile Cradle (PN574) |

### Adhesives & Sealants

Roff's `roff.in/products/roff-vitrofix-adhesive/` page states "Roff Vitro Fix
Adhesive is a cement-based tile adhesive" as a direct quote, with confirmed
Grey/White colour options — both required fields (`adhesive_product_type`,
`adhesive_base`, `adhesive_colour`) sourced from the same page, not
extrapolated from the product family description alone (Pidilite's own
top-level Roff page only gave "primarily cement-based formulations" as a
family-wide claim, which was NOT used — the product-specific page was
fetched and quoted instead).

Roff seeded as its own brand (not a Pidilite alias) — same relationship as
Crabtree/Havells: Legal Metrology fields are Pidilite's, since Pidilite
Industries Limited is the manufacturer. Confirmed:
Regent Chambers, 7th Floor, Jamnalal Bajaj Marg, Nariman Point, Mumbai 400021
· csc@pidilite.com · 1800-266-6066 (all three read directly from
[pidilite.com/contact](https://www.pidilite.com/contact)).

### Safety & Site Equipment

Karam's PN574 helmet page states size explicitly: **"One size (ratchet
adjustment with 6 adjustment points)"** — a genuine, common PPE fact
(helmets, most gloves, and harnesses are typically one-size/adjustable, not
S/M/L/XL like clothing) that the existing `safety_size` enum had no option
for. Added `'One Size'` to the enum rather than mis-mapping to a clothing
size or dropping the product.

Karam confirmed: D-95, Sector 2, Noida, Uttar Pradesh 201301 · karam@karam.in
· 1800-103-7085, read from
[karam.in/contact-us](https://www.karam.in/contact-us) directly — a search
summary for the same query returned a different email
(`customercare@karam.in`); the direct page fetch was trusted over the search
aggregation, per the standing rule.

---

## Schema fixes this pass

| Attribute | Change | Evidence |
|---|---|---|
| `safety_size` | + `One Size` | Karam PN574, stated explicitly on-page |
| `hsn_code` table | + `6506` (headgear) | Needed for the helmet row; was missing entirely, same gap class as the original empty-HSN-table bug |

---

## Not attempted this pass — the other 17 leaves

| Leaf | Notes |
|---|---|
| Hand Tools *(4 sub-leaves: Hammers, Spanners & Wrenches, Screwdrivers & Pliers, Measuring Tools, Masonry Hand Tools)* | Not attempted. Real Indian brands exist (Taparia, Stanley India, GDC) but per-tool spec granularity (size, material, type) across 4 sub-leaves was judged lower-yield than the adhesives/safety wins for the effort, given the category's own "poor" rating. |
| Power Tools *(4 sub-leaves: Drills, Grinders, Saws & Cutters, Demolition & Breakers)* | Not attempted. Brands (Bosch, Makita, Black+Decker) are real and likely well-documented, but not tried this pass. |
| Fasteners *(4 sub-leaves: Screws, Bolts & Nuts, Anchors & Fixings, Nails & Rivets)* | Not attempted — this is the leaf group the project's docs most directly describe as "highly fragmented, many unbranded." Likely the worst-yield leaf group in the category if attempted. |
| Door & Window Hardware *(3 sub-leaves: Locks, Hinges, Handles & Knobs)* | Not attempted. Named brands exist (Godrej, Dorset, Yale) — a plausible foothold if this category is revisited. |

None of these are documented as *tried and blocked* the way Tiles/Lights/RCCB
are — they are simply **not yet attempted**. That distinction matters for
anyone picking this back up: these are open opportunities, not dead ends.

---

## Update 2026-09-14 — Door & Window Hardware attempted, blocked

The recommendation above was tried this session, across all 3 sub-leaves and
2 brands (Godrej, Yale), and did NOT clear the bar — recorded here so the
next pass does not repeat the same fetches expecting a different result.

**Godrej is structurally unreachable.** Every `godrej.com` product URL tried
(mortise locks, hinges, antique brass finish page) redirects to or serves a
generic corporate landing page, not the actual product content — 5 separate
URLs, same failure. Not a data gap; the site does not serve product detail
to a plain fetch. `godrejlocks.com` (their older/legacy domain) was not
tried in depth — it uses old ASP-style URLs that looked likely to have
similar problems, but this is a genuine gap in what was tried, not a
confirmed dead end.

**Yale (`yalehome.com`) IS reachable and DOES publish real specs — but each
leaf is missing exactly one required field:**

| Leaf | Confirmed | Missing (required) |
|---|---|---|
| Locks (EN 85/45, EN 85/60) | `lock_type`=Mortise, `backset`=45mm/60mm (exact enum match), material components (SS/MS/brass, but no single unified `dwh_material`) | `key_type` — genuinely unstated on both product pages checked |
| Hinges (HIN2BB433, HIN2BB533) | `hinge_type`=Butt, size 4"/5" (see schema fix below), `dwh_material`=Stainless Steel (SS304) | `dwh_finish` — pages show unexplained codes SS/AB/BM with **no legend anywhere on the page**, confirmed absent by direct check |
| Handles (YMEL-704 Antique Brass Matt) | `dwh_material`=Zinc Alloy, `dwh_finish`="Antique Brass Matt" (clean match) | `centre_to_centre` — genuinely unstated |

Each leaf was one field short of importable. A genuine, sourceable lead for
the SS/AB/BM finish codes was found (yaleonline.in states "Satin Steel"
explicitly) but **deliberately not used**: that site's own footer states it
is "owned and managed by M/s CAVITAK MARKETING PRIVATE LIMITED" — a
distributor's branded storefront, not Yale's own domain, despite the
"yale" in the URL. Excluded under the standing "brand's own domain only"
rule, the same rule that excluded reseller pricing for Asian Paints
originally.

### Schema fix from this attempt

`hinge_size` widened: `50/75/100/125/150` → **+ `102`, `127`**. Yale's real
India hinges sell in imperial 4"/5" sizes (101.6mm/127mm), not the round
metric sizes the enum assumed — the common case for Indian butt hinges,
which mix imperial and metric sizing, not an edge case. Kept the original
round-metric values alongside the new ones rather than replacing them, since
some brands do sell true round-metric sizes.

### Revised recommendation

Door & Window Hardware is now **tried and blocked**, same status as
Tiles/Lights, not an open opportunity. If revisited: try Dorset (a real
Indian hardware brand with no findable web presence in this pass — worth a
direct URL guess or a different search strategy) or Häfele India (interior
fittings, likely to have a properly structured catalogue given their
B2B/architect-facing positioning). The remaining untried leaf groups —
Hand Tools, Power Tools, Fasteners — are now the only genuinely open
territory left in this category, and Fasteners in particular is the group
the project's own docs most directly warn against.
