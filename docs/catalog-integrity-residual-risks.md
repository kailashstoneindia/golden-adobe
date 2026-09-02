# Catalog Integrity — Residual Risks

Four known gaps in the approach described in
[catalog-integrity-approach.md](catalog-integrity-approach.md).

> [!NOTE]
> **Status as of 2026-08-26: risks 1–3 are implemented and verified against live Postgres.**
> Risk 4 remains open, blocked on the ordering domain. See
> [catalog-implementation-status.md](catalog-implementation-status.md) for what was built,
> real bugs found while building it, and test counts. The risk analysis below is kept as
> written — it is still the reasoning behind why each fix looks the way it does — with a
> **Status** line added under each sketched-fix section noting what actually shipped.

Ranked by damage, not by effort.

| # | Risk | Damage | Detectable? | Cheap to fix? | Status |
|---|---|---|---|---|---|
| 1 | Duplicate brand rows | Multiplies across an entire brand | ❌ silent | ✅ yes | ✅ Implemented |
| 2 | Vendor confirms a wrong match | Permanent, self-reinforcing | ❌ evades price check | 🟡 UI work | ✅ Implemented |
| 3 | Blank variant attributes at publish | Only guard for Stone and Hardware | 🟡 partly | ✅ yes | ✅ Implemented |
| 4 | No customer report path | Errors never surface | — | 🟡 needs order flow | ⛔ Blocked — no ordering domain yet |

---

## 1. Duplicate brand rows defeat the primary constraint

### How it happens

```
Admin A types  "Havells"        → brand_id = X
Admin B types  "Havells India"  → brand_id = Y

UNIQUE (brand_id, mfr_part_number):
   (X, DHMGCSPF032)   ✓ publishes
   (Y, DHMGCSPF032)   ✓ publishes   ← different brand_id, no collision
```

Other real variants that would each create a distinct brand row: `HAVELLS`, `havells`,
`Havells Ltd`, `Havells India Ltd`, `Havells Electricals`.

### Why it is the worst of the four

The constraint **appears to be working**. No error is raised, the database is satisfied, and
nothing in the data looks wrong. The failure surfaces only when a customer sees two
identical MCBs at different prices.

**The blast radius is not one product — it is the whole brand.** A single duplicate brand row
can duplicate every SKU beneath it. One typo during seeding could produce hundreds of
duplicate products, all of which pass every constraint.

This risk sits directly upstream of the primary identity path, so it undermines the
protection that covers most of the catalog.

### Sketched fixes

- Unique index on a **normalised** brand name — lowercase, collapse whitespace, strip
  common suffixes (`Ltd`, `Pvt`, `India`, `Electricals`)
- A `brand_alias` table, exactly symmetric with `stone_variety_alias` — "Havells India"
  resolves to the canonical Havells row
- **Brand creation is admin-approved and never auto-created by an import.** Imports may
  propose a brand; only a human creates one
- Fuzzy similarity warning at brand creation, showing near-matches before saving

> [!NOTE]
> **✅ Implemented.** `normalize_brand_name()` (strips whitespace/case/corporate suffixes)
> backs a unique functional index; a `brand_alias` table resolves known variants to the
> canonical brand; `BrandResolverService` is the single resolution path used by both the
> match ladder and structured matching, and never auto-creates a brand. 6/6 live-Postgres
> checks passing (near-duplicate rejection, alias resolution, unrelated brands unaffected,
> duplicate-alias rejection). See [catalog-implementation-status.md](catalog-implementation-status.md).

---

## 2. A vendor can confirm a wrong match, permanently

### How it happens

```
┌──────────────────────────────────────────────┐
│ We matched your  HAV-32C  to                 │
│ Havells 32A SP MCB C-Curve                   │
│                                   [ Confirm ]│
└──────────────────────────────────────────────┘

Vendor is on a phone, in a hurry, taps Confirm.
They actually stock the B-Curve.
```

### Why it is the most dangerous

Confirmation **writes `vendor_product_map`**, which makes the error authoritative. Step 0 of
the match ladder hits that row on every subsequent upload and never re-checks it.

**The mechanism designed to prevent drift is what cements the mistake.** This is the only
risk in the system that actively gets worse over time rather than staying static.

It also **evades the detection layer**. A C-curve and a B-curve MCB cost nearly the same, so
the price-outlier check will not fire. Nothing upstream catches it, and nothing downstream
catches it either — it reaches a customer.

### Sketched fixes

- **Show two or three candidates rather than one yes/no.** A single confirm button invites a
  reflexive tap; a choice forces a read
- Surface *differing* attributes rather than just the product name — "C-Curve" next to the
  alternatives, so the distinguishing detail is visible
- Let vendors unmap a `vendor_product_map` entry from their own portal
- Age out or re-prompt mappings that were confirmed once and never revisited

> [!NOTE]
> **✅ Implemented** (first two fixes). The match ladder now returns ranked
> `matchCandidates` alongside the primary match; `listPendingConfirmations` computes and
> surfaces the differing attributes against the closest alternative; a new
> `choosePendingListingCandidate` endpoint lets an admin/vendor pick a different candidate,
> which re-points `vendor_product_map` at the **chosen** product — not the original guess —
> which is the actual fix for the compounding risk described above. Verified 12/12 via a
> live E2E script, critically including that an un-offered candidate id is rejected.
> Vendor-side unmap and mapping age-out were **not** built — smaller follow-ups, not blocked
> on anything. See [catalog-implementation-status.md](catalog-implementation-status.md).

---

## 3. Blank variant attributes bypass the identity hash

### How it happens

```
Admin A:  Black Galaxy · Polished · 18mm   →  hash = a3f7…
Admin B:  Black Galaxy · Polished · —      →  hash = 9c21…
                                              different → both publish
```

The hash is built only from variant-defining attribute values that are **present**. Omitting
one produces a different hash, so two rows describing the same product publish cleanly.

### Why it matters disproportionately

This is the **only** protection Stone and Hardware receive. Neither has brand + MPN coverage
worth relying on, and neither has GTINs. If the hash can be bypassed by leaving a field
blank, those two categories have effectively no duplicate protection at all.

### The complication

A blanket "all variant-defining attributes are required" rule is heavier than it looks — a
switch may legitimately have no Series value, and forcing a placeholder is worse than a
blank.

Treating blank as an explicit value in the hash does **not** solve it either: two genuinely
different products *should* hash differently, and the duplicate case is specifically one
admin filling a field and another not, for the same product.

### Sketched fixes

- Require variant-defining attributes at publish — strict, and closes the hole completely
- Or: allow publish but **block with a warning** listing which variant attributes are blank,
  forcing an explicit override
- Or: enforce the requirement **only in the categories that depend on the hash** — Stone and
  Hardware — leaving branded categories unaffected

> [!NOTE]
> **✅ Implemented** — the third option. `trg_mp_require_variant_attrs_on_publish` fires
> only on transition into `live`, only for `is_generic OR stone_variety_id IS NOT NULL`
> products (i.e. exactly the ones the identity hash protects), walks category ancestry to
> find every variant-defining attribute, and raises an exception **naming the specific
> missing attribute(s)** rather than a generic rejection. Branded products are entirely
> unaffected. 4/4 live-Postgres checks passing. See
> [catalog-implementation-status.md](catalog-implementation-status.md).

---

## 4. No customer report path

### What is missing

Every other check in the system is upstream and statistical. A customer receiving the wrong
item is the only source of **ground truth**, and there is currently no structured way to
capture it.

Two distinct failures a customer cannot presently distinguish:

```
"the listing is wrong"        → catalog / match problem
"the vendor sent wrong item"  → fulfilment problem
```

These need different responses, and conflating them means neither gets fixed properly.

### Why it matters

Without it, a wrong match persists **indefinitely**. The business learns about it through
refunds and complaints, with no link back to the catalog row that caused it. Amazon
escalates exactly this class of problem to human Seller Support, because no automated check
reliably catches it.

### Sketched fix — and the important detail

A report on an order line should flag the `vendor_listing`, **and invalidate the
`vendor_product_map` entry that produced it.**

That mapping is what cemented the error in risk 2. Fixing only the order leaves the mapping
intact, so it silently re-applies on the vendor's next upload and the same wrong listing
reappears. The report must reach back to the mapping, not just the listing.

> [!NOTE]
> **⛔ Still blocked, not started.** `orders` / `order_items` do not exist in this codebase
> yet, so there is no order line to attach a report to. When the ordering domain lands,
> build this with the `vendor_product_map` invalidation from the start — see
> [catalog-implementation-status.md](catalog-implementation-status.md#risk-4-customer-report-path--out-of-scope).

---

## Recommended sequencing when this is picked up

1 and 3 are cheap, well-understood, and should simply be done — they close the two silent
holes.

2 is the one to think hardest about, because it is the only risk that compounds. A confirm
screen that shows candidates instead of a yes/no is a small UI change with disproportionate
value.

4 depends on the ordering domain, which does not exist yet, so it is naturally last — but it
should be designed with the `vendor_product_map` invalidation built in from the start, not
bolted on.

**This sequencing was followed as written.** 1, 2, and 3 landed together in one pass
(2026-08-26); 4 remains exactly where this section predicted it would sit — waiting on the
ordering domain. See [catalog-implementation-status.md](catalog-implementation-status.md)
for the as-built record.
