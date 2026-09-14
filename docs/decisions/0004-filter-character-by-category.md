# 0004 — Filter character differs by category; no schema support needed

- **Date:** 2026-08-02
- **Status:** Accepted
- **Supersedes / Superseded by:** —

## Context

Attributes across the eight top-level categories differ in **character**, not merely in
values. Electrical and Plumbing attributes are technical and specification-driven —
amperage, pressure rating, sq mm, voltage grade. Decorative Lights, Tiles and Stone are
style-driven — finish, theme, colour family, material look.

This matters for `is_searchable_filter`. A buyer choosing a chandelier filters by finish and
style, not by wattage; a buyer choosing an MCB filters by rated current and breaking
capacity, and would be actively hindered by aesthetic facets.

[0001](0001-category-tree-and-attributes.md) recorded the tree and the inheritance model but
never captured this point, and `docs/catalog-entity-model.md` speculatively introduced an
`attribute.filter_character` column ('technical' | 'aesthetic') as a home for it. This
record decides whether that column should exist.

## Options considered

### A — No schema support; `display_order` is sufficient *(chosen)*

- **Pro:** Aesthetic attributes for Lights are **declared on Lights itself**, not inherited
  from the root, so the existing `attribute.display_order` already controls their prominence
  within that category. Nothing needs to be added.
- **Con:** Nothing enforces or documents the intent, so it depends on whoever configures
  attributes understanding the distinction.

### B — `attribute.filter_character` column

- **Pro:** Explicit tagging enables consistent cross-category rules ("show aesthetic facets
  first everywhere they exist") and documents intent in the data.
- **Con:** No such cross-category rule exists yet. The column would be written but never
  read — speculative structure justified by a hypothetical requirement.

### C — `category_facet_config` table

- **Pro:** Most flexible. Handles the one case `display_order` genuinely cannot: an
  attribute declared high in the tree needing *different* prominence in different
  descendants.
- **Con:** A new entity for a problem not yet encountered.

## Decision

**Drop the proposed `attribute.filter_character` column.** Filter character is a guideline
for choosing and ordering attributes, not a property the schema needs to model.

The guideline, to be applied when per-category attribute lists are drawn up:

> Set `is_searchable_filter` according to how the category is *shopped*, not by what data
> happens to exist. Lights, Tiles and Stone skew aesthetic — finish, theme, colour family.
> Electrical, Plumbing and Hardware skew technical — rating, size, capacity. Technical specs
> still belong on the product page for decorative categories; they just should not be the
> filters.

The mechanism is existing: declare aesthetic attributes on the decorative category and give
them low `display_order` values so they surface first.

## Why

`display_order` already solves this because of how inheritance works in
[0001](0001-category-tree-and-attributes.md). The case that would defeat it — one attribute
declared near the root needing different prominence in different descendants — does not
arise for the aesthetic/technical split, since aesthetic attributes like `Theme` and
`Finish` are naturally declared on the decorative categories themselves and never inherited
by Electrical.

Option C remains the correct answer *if* that case ever appears. It is not speculatively
built now.

## Consequences

- `docs/catalog-entity-model.md` drops `attribute.filter_character`.
- The guideline above is guidance, not a constraint — nothing prevents someone marking
  `Wattage` as a searchable filter on Lights. Correctness depends on review during attribute
  setup, which is where it belongs.
- If a cross-category facet rule is ever wanted, revisit with option B or C and supersede
  this record.

## Open questions

None. The remaining attribute work is open question 3 of
[0001](0001-category-tree-and-attributes.md) — drawing up the concrete per-category
attribute lists, where this guideline gets applied.
