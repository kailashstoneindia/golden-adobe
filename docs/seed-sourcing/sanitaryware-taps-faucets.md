# Sourcing — Sanitaryware > Taps & Faucets

Fetched 2026-09-13. Sourcing rules per
[electrical-switchgear-mcb.md](electrical-switchgear-mcb.md).

## Result

| Brand | Catalogue URL | Profile | Verified |
|---|---|---|---|
| **Cera** | [cera-india.com Victor range](https://www.cera-india.com/cera/faucets-showers/faucets/single-lever-range/victor/victor) | **C** | 2026-09-13 |
| Jaquar | jaquar.com | **E** — 403 Forbidden on every product page fetched | 2026-09-13 |
| Hindware | not attempted | — | — |

## Findings

**Jaquar blocks fetching entirely** (HTTP 403) — not a data-quality problem,
an access problem. Every jaquar.com product URL tried this pass returned 403.

**Cera's "Vivana" range name is a trap, not a spec.** `handle_type` is
required, and enum options are Single Lever / Quarter Turn / Half Turn.
Vivana pillar cock and bib cock pages were fetched and asked directly
whether "quarter turn" or "half turn" appears as a stated mechanism separate
from the range/breadcrumb name — confirmed it does not. Two rows built on
these were discarded rather than filling handle_type from the range name
("Quarter Turn Range" is Cera's own collection label, not a per-product
spec statement).

**Cera's "Victor — Single Lever Range" does state the mechanism explicitly**
("All products feature 'single lever' operation," confirmed per-product on
each detail page fetched) — this is the difference between a collection NAME
and a stated FACT, and it's why Victor products were seeded and Vivana ones
were not.

**Country of origin: China, confirmed on 3 of 3 Victor products fetched
individually.** Do not assume "India" for a brand headquartered in India —
Cera's own product pages state "Imported by: Cera Sanitaryware Limited...
though manufactured in China" for this range. Checked per-product, not
extrapolated from the brand's registered office (which IS in Gujarat, India
— the manufacturer/importer distinction matters here).

## Seeded

3 products: Victor Single Lever Basin Mixer (F1015451), Wall Mixer
(F1015414), Sink Mixer (F1015501). All `tap_type`/`sanitary_finish`/
`tap_mounting`/`handle_type` confirmed directly per product, not inferred.

## Brand

Cera Sanitaryware Limited — 9, GIDC Industrial Estate, Kadi, Mehsana, Gujarat
382715 · ceracare@cera-india.com · 1800-258-5500.
Source: [cera-india.com/registered-office](https://www.cera-india.com/registered-office) +
[cera-india.com/cera-care](https://www.cera-india.com/cera-care)
