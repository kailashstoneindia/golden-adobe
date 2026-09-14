# 0016 — Absolute colour price per listing

- **Date:** 2026-08-02
- **Status:** Accepted
- **Supersedes:** [0015](0015-per-vendor-colour-delta.md) entirely. Reinstates the
  `vendor_listing_colour_price` model from [0007](0007-colour-family-pricing.md).

## Context

[0015](0015-per-vendor-colour-delta.md) replaced per-listing colour prices with a per-vendor
per-litre delta, to spare vendors from maintaining ~500 prices. It then needed a per-listing
override for margin, which introduced a two-level `COALESCE` and a genuinely confusing
behaviour: an override with no matching vendor-level row still returned `NULL`, because the
vendor row declared *availability* while the override only set the *rate*.

That subtlety is the signal. A pricing model that needs a paragraph to explain why a number
you can see is not the number being used is too clever for the problem.

## Decision

**One absolute price per listing per colour family.**

```sql
vendor_listing_colour_price (
  vendor_listing_id,
  colour_family,
  price,
  PRIMARY KEY (vendor_listing_id, colour_family)
)
```

```
unit_price = vendor_listing_colour_price.price
```

No delta. No per-litre scaling. No override. No `COALESCE`. A colour family with no row is
not offered by that vendor, and the picker does not show it.

`vendor_listing.price` remains the untinted price and the floor that `cached_best_price`
uses, so search still renders "from ₹X".

`resolve_unit_price()` survives and gets simpler — a branch and a lookup. Keeping it matters
regardless of how prices are stored: price display, the cart, order lines and
`cached_best_price` must all resolve identically.

## Why the volume objection collapsed

0015 existed because 50 paint listings × ~10 colours is ~500 rows. That argument assumed the
vendor types them.

They do not. The pre-filled export from [0011](0011-product-code-and-vendor-export.md)
generates the sheet **pre-expanded** — one row per product per colour, with `product_code`
and colour already filled. The vendor fills a price column, using fill-down and copy-paste
like any spreadsheet. 500 rows of mechanical entry is a different problem from 500 decisions.

The delta model optimised a cost that the export had already removed.

## What is given up

- A vendor cannot express a colour rule once and have it apply across products. Every
  product's colour prices are entered separately.
- Adding a new paint product means entering its colour prices too, rather than inheriting a
  vendor-level rule.

Both are acceptable: they are data-entry costs against a mechanical, pre-filled sheet, not
modelling limitations. **If a vendor later asks for "blue is always +₹250 on everything", a
vendor-level default with per-listing rows overriding it is an additive change** — the table
here stays, and a default layer sits underneath.

## Consequences

- **21 tables** — `vendor_colour_delta` out, `vendor_listing_colour_price` back.
- `vendor_listing.colour_delta_per_litre` is dropped.
- `resolve_unit_price()` loses its `COALESCE` and its availability-versus-rate distinction,
  and with them the behaviour that prompted this reversal.
- Paint's vendor template returns to one row per product per colour, and the separate
  `vendor-colour-delta.csv` sheet is deleted.
- The paint colour picker is still driven by which rows exist — that requirement is
  unchanged, and still what makes 0014's "show as unavailable" answer work.

## Open questions

1. Should white / untinted be required as a row, or inferred from `vendor_listing.price`?
   Requiring it is more uniform; inferring it is one less thing to forget.
2. If vendors do find per-product entry tedious at scale, revisit with a vendor-level default
   layer *underneath* this table rather than replacing it.
