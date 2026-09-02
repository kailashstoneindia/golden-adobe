# Seed Samples — Brand-Sourced, Fetched 2026-08-24

Small representative samples pulled live from brand websites, per
[catalog-build-order.md](../catalog-build-order.md) Phase 0/1: *"a small representative
sample per category is enough"* to build and test schema/tooling against — this is **not**
the 4,000–6,000 SKU launch catalog, which is a separate seeding workstream.

Scope, per user decision: **Havells, Asian Paints, Cera only.** UltraTech (cement) was
excluded — it doesn't map to any of the 8 launch categories in
[catalog-structure.md](../catalog-structure.md).

## Files

| File | Category path | Rows | Brand |
|---|---|---|---|
| [havells-mcb.csv](havells-mcb.csv) | `electrical/switchgear/mcb` | 16 | Havells |
| [havells-wires-cables.csv](havells-wires-cables.csv) | `electrical/wires-cables` | 4 | Havells |
| [havells-switches-sockets.csv](havells-switches-sockets.csv) | `electrical/switches-sockets` | 14 | Havells |
| [havells-switch-plates.csv](havells-switch-plates.csv) | `electrical/switch-plates` | 6 | Havells |
| [asian-paints-interior-emulsion.csv](asian-paints-interior-emulsion.csv) | `paint` | 14 | Asian Paints |
| [cera-wash-basins.csv](cera-wash-basins.csv) | `sanitaryware/wash-basins` | 10 | Cera |

Columns in each CSV are named to match the attribute tables in catalog-structure.md
directly (e.g. `rated_current_a`, `conductor_size_sqmm`, `module_size`) — not a generic
scrape shape — so mapping into `master_product_attribute_value` is close to 1:1.

## What's solid vs. what needs verification before real use

**Solid** — fetched from a brand's own product-detail page, code and specs both present:

- Havells MCB: all 16 rows, from the live circuit-breaker listing page
- Havells wire: only 1 of 4 rows has a confirmed `mfr_part_number` (Lifeline FR 1.0 sq mm,
  `WHFFDNRL11X07-C`) — the other 3 sizes were found via search snippets only, no product
  code pulled
- Cera: only **Calibre** (`S2040109`) and **Calburt** (`S2020137`) have confirmed
  dimensions + product code, from their own detail pages

**Needs a second pass — flagged inline in each CSV:**

1. **Havells switches** — `module_size`/`current_rating`/`finish` blank for Coral and
   Apogee rows; the category listing page didn't state them, only the product page would.
   No `mfr_part_number` captured for any switch/plate row — the listing page doesn't show
   codes, only product detail pages do.
2. **Cera** — 8 of 10 basin rows (Carpio, Calvis, Ceeza, Curvis, Cloister Slim, Caffie,
   Canal, Chiara) are "related product" tiles: name + price only. No dimensions, no
   product code, no confirmed material. Mounting type is inferred from which page they
   appeared on, not confirmed on their own page.
3. **Asian Paints pack pricing is the weakest data here.** The Royale category page gives
   per-litre prices for 11 *product lines* (Matt, Glitz, Aspira, etc.) but no pack sizes.
   The one row with 1L/4L/10L/20L pack pricing (`Royale Luxury Emulsion`) came from
   **third-party reseller aggregators (nobroker.in, aapkapainter.com), not
   asianpaints.com** — the actual product detail page 404'd on this fetch. Treat that block
   as directional only; re-fetch `asianpaints.com` directly before trusting it.
4. **No colour-family pricing captured at all.** Per
   [0002](../decisions/0002-paint-shade-and-tinting.md) and
   [0007](../decisions/0007-colour-family-pricing.md), Paint pricing is per colour family,
   not a flat SKU price — these rows are base/white product prices only. Getting real
   colour-family deltas means pulling the colour catalogue tool
   (`asianpaints.com/colour-catalogue.html`), which is a separate, larger fetch.
5. **No GTIN captured for any product**, from any brand — none of the pages surfaced one.
   Dedup for these rows falls entirely on `(brand_id, mfr_part_number)`
   ([0012](../decisions/0012-product-identity-and-deduplication.md)), which is exactly why
   the missing MPNs in Havells switches/plates and 8 of the Cera rows are the priority gap,
   not a cosmetic one — those rows would fall back to
   [identity-hash dedup](../decisions/0013-identity-hash-for-unbranded-products.md) despite
   being branded products with a real MPN we just didn't capture.
6. **No images, GTIN, warranty period, or certification mark** were pulled for anything —
   out of scope for this pass, but all four are schema fields (0. Global attributes /
   `master_product_media`) a real import would need.

## Not covered this pass

Category-6 items from `catalog-structure.md` that Havells/Asian Paints/Cera *do* sell but
weren't fetched: Fans, LED Bulbs, Conduits, RCCB/Distribution Board/Isolator (only MCB was
pulled from Switchgear), and Cera's Tiles/Faucets/Wellness lines. Extend the same fetch
pattern per-category if a broader sample is wanted before Phase 3 tooling exists.

## Source note

All URLs are inline per-row in each CSV (`source_url` column). Fetched via live web
search/fetch on 2026-08-24; brand sites change layout and pricing without notice — treat
prices especially as a snapshot, not current truth, by the time this is actually used for
seeding.
