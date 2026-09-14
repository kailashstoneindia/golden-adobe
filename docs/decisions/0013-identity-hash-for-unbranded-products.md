# 0013 — Identity hash for products with no brand or MPN

- **Date:** 2026-08-02
- **Status:** Accepted
- **Resolves:** open question 3 of [0012](0012-product-identity-and-deduplication.md)

## Context

[0012](0012-product-identity-and-deduplication.md) made `UNIQUE (brand_id,
mfr_part_number)` a hard constraint, closing duplicate risk for branded products. It left
generics, stone and unbranded hardware protected only by a soft warning an admin can click
through — the weakest protection sitting in the categories with the weakest data.

The proposal: compute an `identity_hash` from a product's variant-defining attribute values
and enforce `UNIQUE (category_id, identity_hash)` at publish time. This record assesses
whether that is actually sound, from evidence rather than reasoning.

> ### ⚠️ Source-quality note
>
> An earlier revision of this record quoted several passages that could not be verified when
> the primary documents were checked. Specifically: a quotation attributed to
> blog.affiliate.com does not appear there (that page says only *"Require Brand plus MPN to
> reduce collisions across regions or bundles"*); the claim that MPN is unique only within a
> manufacturer's namespace was attributed to a source that does not state it; and the
> Köpcke EDBT paper could not be read.
>
> The quotations came from search-result summaries rather than from the documents
> themselves. The decision below is unchanged, but the reasoning is now presented as what it
> actually is: **first-party measurement plus definitional argument**, not literature
> citation.

## Feasibility evidence

### 1. The technique is standard, and the argument is definitional

Deterministic entity resolution — declaring two records identical when they agree exactly on
a defined set of attributes — is textbook practice, and hashing a variant-defining attribute
set is one implementation of it. Composite keys and hash comparison are ordinary MDM
techniques.

This does not need a citation to stand, and the citations previously offered did not
support it as stated.

The related claim underpinning [0012](0012-product-identity-and-deduplication.md) — that
brand + MPN must be composite — is likewise **definitional rather than researched**. A
manufacturer part number is assigned by one manufacturer with no cross-manufacturer
coordination, so it cannot be globally unique by construction. Google Merchant Center's
practice of requesting brand alongside MPN is consistent with this, though the specific
uniqueness wording could not be confirmed in Google's own documentation.

### 2. The known failure mode is self-evident, not a finding

Exact-match comparison fails on free text: `"Crabtree Athena"` and `"Crabtree ATHENA"` are
different strings and would hash differently. Deterministic matching is reliable on
**controlled values** and unreliable on **free text**.

That is the whole feasibility question, and — importantly — it is answerable from our own
data rather than from anyone's blog.

### 3. Our own data — the strongest evidence here, and the only first-party evidence

Counting variant-defining attributes across all 58 leaf categories in
[catalog-structure.md](../catalog-structure.md):

| Data type | Count | Deterministically hashable? |
|---|---|---|
| enum | 101 | ✅ constrained by `attribute_value_option` |
| number | 44 | ✅ with canonicalisation |
| boolean | 2 | ✅ |
| **text** | **6** | ❌ free text — the failure mode above |
| **Total** | **153** | **96% safe** |

The attribute model already forces most variant-defining values through
`attribute_value_option`, which is what makes exact-agreement matching viable here. This was
not designed for deduplication, but it is what makes deduplication possible.

**All six free-text offenders, named:**

| Category | Attribute |
|---|---|
| Switches & Sockets | Series |
| Switch Plates & Frames | Series |
| Fans | Finish |
| Wash Basins | Dimensions |
| Adhesives & Sealants | Colour |
| Stone (level 1) | Slab / Tile Size |

Each is a genuine dedup hole: `"Crabtree Athena"` and `"Crabtree ATHENA"` would publish as
two products.

### 4. Not depending on GTIN — weaker evidence than first claimed

An earlier revision cited a figure that GTIN is *"hidden, missing, or wrong on roughly a
third of the pages"*. On checking, that comes from a **commercial web-scraping vendor's own
client work** — European cosmetics retail across 13 retailers — with no published
methodology, no category breakdown, and no relevance to Indian building materials. It is a
marketing claim, not research, and is **not load-bearing here**.

What does support the decision is closer to home: our own categories include stone,
generics and unbranded hardware that have no GTIN *by construction* — quarried material has
no manufacturer, and sand has no packer. That argument needs no external data.

### 5. Rules plus review, never rules alone

The constraint does not replace the review queue. It removes the cases that should never
have needed a human, and leaves ambiguous ones for a person. This is ordinary practice and
is asserted here as design judgement rather than as a sourced finding.

**Verdict: feasible**, conditional on fixing the six text attributes and canonicalising
numbers. The verdict rests on the attribute-type count in section 3, which is measured
directly from this catalog.

## Decision

### Add `identity_hash`, enforced at publish

```sql
ALTER TABLE master_product ADD COLUMN identity_hash TEXT;

CREATE UNIQUE INDEX master_product_generic_identity
  ON master_product (category_id, identity_hash)
  WHERE status = 'live' AND identity_hash IS NOT NULL;
```

Enforcing at **publish**, not insert, is what makes this work at all: attribute values are
written after the product row, so at insert there is nothing to hash. Drafts are
unconstrained; `status → live` is already a deliberate step (0001), and by then the
attributes exist.

The hash is computed by trigger from `master_product_attribute_value`, restricted to
attributes where `is_variant_defining = true`, reusing the machinery built for
`attributes_flat` in [0006](0006-constraint-and-cache-invalidation-mechanisms.md).

### Normalisation before hashing — mandatory, not optional

Per the Sony TV failure mode and MDM normalisation practice (*"standardizing text case,
punctuation, and abbreviations"*):

| Type | Canonicalisation |
|---|---|
| text / enum | trim, collapse internal whitespace, case-fold |
| number | strip trailing zeros — `18`, `18.0`, `18.00` must hash identically |
| all | sort by attribute code before hashing, so ordering cannot vary |

Without numeric canonicalisation the constraint is theatre: `thickness 18` and `18.0` are
the single most likely duplicate pair in a tile or stone catalog.

### Convert the six free-text variant-defining attributes to enum

`Series`, `Finish`, `Colour`, `Dimensions`, `Slab / Tile Size` become enums with
`attribute_value_option` entries. They are finite in practice — Havells ships a countable
number of switch series, and stone slab sizes are nominal.

Rule going forward: **a variant-defining attribute may not be free text.** If a value
distinguishes one SKU from another, it must come from a controlled list. Free text is fine
for descriptive attributes, which do not enter the hash.

## Consequences

- Duplicate generics and stone become **impossible at publish**, closing the gap 0012 left
  open. All three identity paths are now enforced.
- **Publishing can now fail** with a duplicate error. The admin UI must resolve this to
  "this product already exists: `GA-0012345`", not surface a constraint violation.
- Changing a variant-defining attribute value on a live product changes its hash, and could
  collide with another live product. The trigger must recompute on attribute change, and
  that write can fail — the same class of deferred failure as `attributes_flat`.
- Six attributes need converting to enum, and their value lists compiled. Small, but it is
  catalog work, not code.
- **Residual risk:** the constraint only fires when both products carry the same set of
  variant-defining attributes. If one is published with an attribute left blank, the hashes
  differ and both publish. Variant-defining attributes should therefore be **required at
  publish**.
- Effort: one column, one trigger, one index, plus normalisation — roughly a day, reusing
  the `attributes_flat` trigger pattern.

## Open questions

1. Should variant-defining attributes be hard-required at publish? It closes the residual
   hole but makes publishing stricter.
2. Which hash — `md5` is sufficient here (collision risk is irrelevant at this scale) and
   keeps the column short.
3. Does the hash need versioning, so that changing the normalisation rules later can trigger
   a rebuild rather than silently mismatching old rows?

## Sources, with quality graded

**Primary — first-party, verified:**

- Attribute-type counts in section 3, measured directly from
  [catalog-structure.md](../catalog-structure.md) across all 58 leaf categories. This is the
  evidence the decision actually rests on.

**Checked, and found weaker than first presented:**

- [GTIN product matching — GroupBWT](https://groupbwt.com/blog/product-matching/) — the
  "one third" figure is this **commercial scraping vendor's own client data** from European
  cosmetics retail. No methodology, no category breakdown. Downgraded; not load-bearing.
- [Identifier governance for AI catalogs — affiliate.com](https://blog.affiliate.com/identifier-governance-for-ai-catalogs/)
  — **vendor marketing blog**. States only *"Require Brand plus MPN to reduce collisions
  across regions or bundles"*. An earlier revision attributed a stronger quotation to this
  page that does not appear on it.

**Cited but not verified — could not read the source:**

- [Tailoring entity resolution for matching product offers — Köpcke et al., EDBT 2012](https://openproceedings.org/2012/conf/edbt/KopckeTTR12.pdf)
  — a genuine peer-reviewed paper and the most authoritative item here, but the PDF could
  not be rendered, so nothing in this record should be treated as resting on it.

**Vendor content, useful as orientation only** — Claro, Parseur, Datagaps, McFadyen, Xylity.
All are commercial data-tooling vendors publishing marketing material. Their descriptions of
standard MDM practice are consistent with each other and with textbook entity resolution,
but none is independent research.

**Rule for future records in this folder:** open the document before quoting it, and label
whether a claim is measured, definitional, or cited.
