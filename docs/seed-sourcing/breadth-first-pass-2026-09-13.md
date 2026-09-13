# Breadth-first sourcing pass — 2026-09-13

Following the pace problem flagged after 5 sequential leaf-by-leaf commits
(diminishing yield per fetch on Water Tanks/Valves), switched to one
confirming pass per remaining leaf across all untouched categories rather
than exhausting each leaf before moving on. User-approved trade-off: more
leaves end up thin or blocked, in exchange for covering every category at
least once.

## Result

| Category | Leaf tried | Outcome |
|---|---|---|
| Sanitaryware | Water Closets | ✅ 1 product (Cera Cona) |
| Sanitaryware | Bath Accessories | ✅ 2 products (Cera soap dish, towel rail) |
| Tiles | (attempted: Kajaria, Somany, Nitco) | ❌ blocked — see below |
| Lights | (attempted: Philips ceiling/lamp/wall, Wipro, Havells wall) | ❌ blocked — see below |
| Paint | Interior Emulsion | ✅ 2 products (Berger Silk Glamor Matt, Soft Sheen) |

Total this pass: **5 new products** (152 → 157), 1 taxonomy fix, 1 process
correction (see below), 2 new brands (Cera done in the prior commit; Berger
this pass).

---

## A process gap this pass surfaced, corrected going forward

While checking Paint's `country_of_origin`, noticed **149 of 155 previously
seeded products default to "India" without a per-product confirmed
statement** — the assumption held for the brand's home country, not verified
per SKU the way the "never infer" rule otherwise requires. Cera's faucets
proved this assumption is unsafe even for an Indian company (their range is
imported from China).

**User decision 2026-09-13: this rule may be lenient.** `country_of_origin`
alone is now the one field allowed to default to a brand's registered
manufacturing country without per-product confirmation — recorded formally
in [electrical-switchgear-mcb.md](electrical-switchgear-mcb.md) rule 5,
including the Cera exception (once a brand has shown even one imported
product, its other products must still be checked, not defaulted). No
retroactive re-verification of the 149 rows was requested.

---

## Tiles — blocked, three brands, three different failure modes

- **Kajaria**: every product page AND every PDF catalogue returns HTTP 403.
  Not a data gap — an access block.
- **Somany**: product pages render name, material, and (for some products)
  colour family — but size, finish, and thickness consistently do not appear
  in the fetched page content, even though search-engine snippets for the
  same URLs show them (e.g. "MATT finish 600 X 600 MM" appeared in a search
  result but was confirmed, on direct inspection, **not present** in the
  fetched page text). This means the spec data is populated client-side
  (JS-rendered), the same failure mode as Schneider's and Supreme's
  storefronts earlier in this sourcing effort — the crawler that fed the
  search index saw more than a plain fetch retrieves.
- **Nitco**: one of their own search results states their vitrified-tiles
  page domain "is for sale" (parked/lapsed); a specific product URL fetch
  returned no output at all.

All three required fields (`tile_size`, `tile_finish`, `tile_thickness`) plus
`tile_colour_family` were confirmable on Somany's product NAME/URL in some
cases (e.g. `CHAMPION GREY` → colour family "Grey", confirmed on-page) but
not the numeric/technical ones. Revisit with a tool that executes JavaScript,
or via a brand's PDF price list if one is reachable (Kajaria's PDFs are also
403'd, so this would need a different brand).

## Lights — blocked, structural mismatch, not a brand problem

Tried 3 different leaves across 2 brands specifically to distinguish "wrong
brand" from "wrong schema expectation":

| Leaf | Brand | Blocked on |
|---|---|---|
| Ceiling Lights | Philips (3 products) | `diameter_width` + `drop_length` (both required) never stated |
| Lamps | Philips (1 product) | `lamp_height` (required) never stated |
| Wall Lights | Havells (2 products) | `light_direction` (required) never stated |

Three different leaves, three different required fields, two different
brands, same outcome: **consumer lighting sites publish finish, material and
lamp-holder type, but not the numeric dimension or directional fields this
taxonomy requires.** This reads as a structural mismatch between what the
taxonomy expects sellers to publish and what they actually do, not a sourcing
failure fixable by trying another brand.

One genuine fix DID come out of this: `light_body_material` was missing
"Plastic" — confirmed on two real Havells wall-light pages ("Material:
Plastic" for PP housings) — added to the enum. This is a real gap, same
class as `sweep_size`/`isolator_rated_current` before it, but it does not
unblock Lights on its own since the unstated dimensional fields are the
actual wall.

**Not recommended**: relaxing `diameter_width`/`drop_length`/`light_direction`
to optional the way `current_rating` was for switches. That earlier change
was justified because SOME real devices (fan regulators) genuinely have no
current rating — a physical fact about the product category. Here the
dimensions physically exist on every fixture; they are simply not published
online by the brands checked. Making a real, always-present measurement
optional to route around a publishing gap is a different and weaker
justification than the current_rating precedent, and is flagged rather than
done unilaterally.

## Paint — resolved

Berger's "Silk Glamor" line states sheen and grade as literal on-page text
("Luxury Interior Paint for Elegant Matt Finish"), not inferred from a
collection/range name — checked directly, following the same
distinction that separated Cera's Victor range (kept) from its Vivana range
(discarded) in the previous commit. 2 products seeded once `country_of_origin`
was resolved per the rule change above.

Berger brand seeded: Berger House, 129, Park Street, Kolkata 700017 ·
consumerfeedback@bergerindia.com · 1800 103 6030. Address confirmed via
search corroborated by CIN (L51434WB1923PLC004793), not a direct page fetch
— the two other fields were confirmed on two separate bergerpaints.com pages
directly.

Asian Paints not attempted this pass — already documented as blocked
(product pages 404, pack pricing only on reseller sites) in the original
2026-08-24 sourcing README.
