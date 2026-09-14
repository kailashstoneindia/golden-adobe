# Fasteners — extended attempt, 2026-09-14

**Result: 0 products seeded.** This is an honest report of a real, extended
attempt across 9 brands and multiple leaves within Fasteners, all
ultimately blocked — not a token effort before giving up. Written up in
full because the near-misses and the taxonomy fixes found along the way
have real value for whoever tries next, even though nothing landed.

---

## Brands tried, and exactly where each blocked

| Brand | Leaf | Confirmed | Blocked on |
|---|---|---|---|
| Hettich (`shop.hettich.com/in_EN`) | Screws | diameter, length*, pack qty, coating("Galvanised") | `fastener_material` — "Galvanised steel" conflates material+coating into one descriptor, not separable |
| Unbrako (`unbrako.com`) | Bolts & Nuts | `bolt_type`=Hex Bolt, `property_class`=10.9 (exact) | `fastener_material`, `fastener_coating` — both confirmed absent by direct check; property-class table lists coatings as a SEPARATE site section, not tied to this product |
| fischer (`fischer.in`) | Anchors & Fixings | **Everything else**: `anchor_type`=Wedge Anchor, `base_material`=Concrete, diameter=10mm, length=80mm, pack=20, coating=Zinc Plated, GTIN confirmed | `country_of_origin` only — confirmed absent, checked exhaustively (product page, imprint, company search); fischer manufactures in multiple countries so the brand-default rule doesn't resolve it cleanly |
| fischer (stainless variant) | Anchors & Fixings | material="Stainless steel" (literal), no coating (correctly — SS doesn't need one) | Diameter 16mm not in enum; grade (304 vs 202) not specified; not pursued further once the ZP variant above got further |
| Ferry International (`ferry-international.com`) | Anchors & Fixings | `anchor_type` context (expansion), material=Brass, country=India (Ghaziabad, confirmed), per-size table (8/10/12/15mm x 22/28/33/38mm) | Sizes don't match `fastener_diameter`/`fastener_length` enums even after the widening from the fischer row; `anchor_type` enum has no clean "expansion"/brass category |
| Everest Industries | Screws | — | No dedicated official product page found at all |
| GKW | Bolts | — | No official manufacturer site found; only reseller/distributor listings |
| MISUMI India | Screws | — | 403 Forbidden, same as Kajaria/Jaquar/Godrej |
| Sundram Fasteners (`sflproducts.sundram.com`) | — | — | Digital catalogue is a JS-rendered empty shell to a plain fetch |
| Deepak Fasteners (`deepakfasteners.com`) | Bolts | `property_class`=10.9, diameter range M4-M80, country="India" (direct brand claim: "Largest Industrial Fasteners Manufacturer in India") | `fastener_material`, `fastener_coating` — both unstated for the specific hex-bolt product line, same wall as Unbrako |

\* Hettich length (28mm, 34mm) doesn't match the enum even after prior
widenings — not pursued once material blocked the row anyway.

---

## The pattern, stated plainly

**Industrial/B2B fastener sites consistently publish property class and
size RANGE, but not base material or coating for a specific SKU.** This
recurred across Unbrako, Deepak Fasteners and (differently) Hettich — three
independent brands, same shape of gap. This is not a fetching problem; two
of the three were checked with a direct "does the page state X" query and
confirmed genuinely absent. This matches the project's own docs calling
Fasteners "highly fragmented, many unbranded" — the fragmentation shows up
here as **specification fragmentation**, not just brand fragmentation.

**Retail/consumer fastener sites are essentially absent.** Every brand
checked in this category is B2B/industrial-facing. This is a structural
difference from every other category attempted this session (Electrical,
Plumbing, Sanitaryware, Paint), where at least one retail-facing brand
existed and worked.

---

## fischer — the closest near-miss, one field short

Worth flagging on its own: the fischer FAZ II Plus 10/80 ZP anchor
(article 564583) is confirmed correct on literally every field except
`country_of_origin`. It has a real GTIN (4048962462081), a specific product
page, confirmed material, coating, diameter, length, pack quantity, base
material, and anchor type. **If `country_of_origin` is ever independently
resolved for fischer** — a phone call to their India office, a distributor
invoice, or a packaging photo — this row is otherwise import-ready as-is,
sitting in `docs/seed-samples/hardware-anchors-fixings-fischer.csv`. Tried
importing it and confirmed the rejection is exactly and only that one field:

```
rows 1  accepted 0  rejected 1
  [country_of_origin] required and empty
```

---

## Schema fixes made this pass (real value even without a landed product)

| Attribute | Change | Evidence |
|---|---|---|
| `fastener_material` | + `Nylon` | fischer Universal Plug UX, GTIN 4006209627570, confirmed directly |
| `fastener_diameter` | + `14` | Same product — wall-plug diameters commonly fall between screw-gauge sizes |
| `fastener_pack_quantity` | + `20` | fischer FAZ II Plus, confirmed directly — heavier anchors pack in smaller counts than light screws |

All three follow the same pattern as prior fixes this session
(`sweep_size`, `safety_size`, `hinge_size`): the original enum was sized
around one product sub-type and didn't anticipate the full real range once
a different sub-type was checked.

---

## What's still open in Fasteners

- **Screws, Bolts & Nuts**: no product landed; Atul Fasteners (self-tapping
  screws, explicitly states "Medium Carbon Steel" and "SS in A2/A4 grades"
  per a search summary, NOT yet directly fetched) is the strongest
  untried lead for resolving the material-ambiguity problem that blocked
  every other brand tried.
- **Nails & Rivets**: not attempted at all this pass.
- **`anchor_type` enum may need a general "Expansion Anchor" option** —
  Ferry International's brass anchors don't cleanly fit any of Wedge/
  Sleeve/Drop-in/Chemical/Plastic Wall Plug. Not added without a confirmed
  product to justify the exact wording, per the standing rule against
  speculative widenings.
