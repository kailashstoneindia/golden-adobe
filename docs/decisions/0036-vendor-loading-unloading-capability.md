# 0036 — Vendor loading/unloading capability and checkout charge

- **Date:** 2026-10-19 (charge model corrected 2026-10-19 per client clarification — see
  Addendum; checkout-half sequencing updated 2026-10-19 — see Consequences)
- **Status:** Accepted and built (vendor field merged in `main` PR #21; checkout charge built
  directly in `worktree-phase-3-ordering-domain`, pending that worktree's own merge). Only the
  real per-sqft rate is still open.
- **Supersedes / Superseded by:** —

## Addendum (2026-10-19) — charge model corrected to price-per-sqft, category-scoped

The client clarified after this record was first drafted: the charge is **price per square
foot**, and it **only applies to tiles and stone** — not a flat per-vendor-group fee across all
categories as originally designed below. The "Options considered" and "Decision" sections below
describe the flat-fee model that this addendum replaces; they are kept for the record (per this
project's convention of not deleting superseded reasoning) but **the per-sqft/category-scoped
model in this addendum is the one to build.**

This is a materially simpler fit than it first appears, because the category/UoM groundwork
already exists:

- `category` (`apps/backend/src/modules/catalog/models/category.model.ts`) already has
  `unit_of_measure_default_id` (nullable FK to `unit_of_measure`) on every row — tiles and stone
  leaf categories (`tiles/floor-tiles`, `tiles/wall-tiles`, `tiles/outdoor-parking`,
  `tiles/elevation-tiles`, `stone/natural-stone`, `stone/engineered-stone`, per
  `docs/catalog-structure.md` §6 and §8) are already priced/stocked in `sqft`
  (`vendor-stock.dto.ts:37`: "the unit is the category unit of measure (tonnes, boxes, sqft)").
- This means **no new area field is needed anywhere** — the order line's existing `quantity`
  (on `order_items`, unit implied by the listing's category UoM) is already expressed in sqft
  for exactly the two categories this charge applies to. The fee computation is
  `quantity × rate_per_sqft`, not a flat add-on.

Revised design:

- **Still accept the vendor capability field as designed below** (`has_loading_unloading_team`
  boolean on `vendors`) — that part of the client's ask is unchanged: it still gates *whether*
  the fee applies to a given vendor's lines, only the *amount* changes from flat-per-group to
  per-sqft.
- **Replace `order_vendor_group.loading_unloading_fee` (flat) with a computed sum, not a single
  config constant.** At checkout, for each `order_item` whose listing's category is tiles or
  stone (check category path prefix `tiles/` or `stone/`, matching the existing subtree-prefix
  pattern `idx_category_path` already used elsewhere in this catalog) **and** whose vendor has
  `has_loading_unloading_team = false`: `line_fee = quantity × loading_unloading_rate_per_sqft`.
  Sum these per vendor group into the same `order_vendor_group.loading_unloading_fee` column
  already designed below — the column survives, only what's written into it changes.
- **The rate is a single global config constant** (`loading_unloading_rate_per_sqft`), not
  per-category or per-vendor — the client said "price per sq ft," singular, not one rate for
  tiles and a different one for stone. If that assumption is wrong, it's cheap to split into
  two constants later; nothing in the schema forces one rate today (the computation is per-line,
  so a future per-category rate table is an additive change, not a rework).
- **Category scoping check happens in the checkout service**, not in the schema — no new column
  needed on `master_product` or `category` to mark "this category is fee-eligible." The existing
  `tiles/` and `stone/` path prefixes are the eligibility test, because this project already
  uses path-prefix matching as the standard way to ask "is this in category subtree X"
  (`category.path`, `idx_category_path`, `text_pattern_ops` — see `category.model.ts:55-62`).

Everything else in this record (vendor-field independence from Phase 3, the
worktree-vs-`main` merge-sequencing constraint, no-split-settlement via `grand_total`) is
unchanged by this correction.

**Numbering note (corrected 2026-10-19):** this record originally cited "0033" and "0034" for
the Phase 3 worktree's cart/order-structure and merge-plan records — both wrong, based on a
secondhand research summary. Confirmed directly against the worktree's own `docs/decisions/`
listing: the worktree's cart/order-structure record is actually **0036**
(`cart-and-order-structure.md`), and the merge-plan/admin-API-gap record is **0034**, but that
one lives only on `main` (`docs/decisions/0034-phase-3-ordering-domain-completion.md`) — it was
never ported into the worktree at all. Every "worktree's 0036" reference below means that
worktree-local file (not present in this branch's `docs/decisions/` until ported and
renumbered); every bare "0034" reference means this project's own `main`-branch record, cited
normally. See [0035](0035-client-feedback-triage-2026-10-18.md)'s numbering note for the full
explanation.

## Context

Client question (2026-10-18, see [0035](0035-client-feedback-triage-2026-10-18.md) Q2): who
loads and unloads heavy items (tiles, sanitaryware, stone) at delivery — the vendor's own crew,
or does Golden Abode need to supply labor? They asked for this to become a vendor onboarding
field (does this vendor have their own loading/unloading team) and a checkout-time charge.

This splits across two phases that are in different states of completeness:

- **Vendor capability field** — Phase 2, Vendor Module, **merged to `main`**.
  `apps/backend/src/modules/vendors/models/vendor.model.ts` is the target. Current columns:
  `id, userId, shopName, address, latitude, longitude, upiId, bankDetails, gstin, cityId,
  citySource` (confirmed current against `main`). No capability/logistics field of any kind
  exists today. The nearest precedent for adding a nullable column to this already-production
  table is `city_id`/`city_source`
  (`apps/backend/database/migrations/20260828090002-add-city-id-to-vendors.js`,
  `20260902090000-add-city-source-to-vendors.js`) — both additive, nullable, with an explicit
  backfill story, not a breaking change to existing vendor rows.

- **Checkout charge line item** — Phase 3, Checkout Flow. **This is the harder constraint:**
  the entire orders/cart/checkout module does not exist on `main` yet. It lives only in the
  unmerged worktree branch `worktree-phase-3-ordering-domain`
  (`Z:\workspace\golden-abode\.claude\worktrees\phase-3-ordering-domain\...`), which per 0034 is
  reviewed, tested, and planned to merge as-is before any fast-follow work lands on top of it.
  In that worktree, `checkout.service.ts` computes `grandTotal` as a pure sum of
  `price × quantity` across lines (line ~294), with no fee/tax/delivery-charge concept anywhere.
  `order_vendor_group` (migration `20261008090003-create-orders-domain.js`) has exactly five
  columns: `id, order_id, vendor_id, subtotal, status` — no charge column. The worktree's own
  0036 (cart-and-order-structure)'s deferred-work table (lines 229-234) already names
  `order_vendor_group` as the attachment point for two other deferred per-vendor-group fields
  (delivery OTP, open-box photo) — this is the same shape of problem and the same table is the
  right place to extend.

The worktree's own 0036 also establishes there is **no split settlement**:
the platform collects one `grand_total` from the customer, and `order_vendor_group.subtotal`
today exists only for reconciliation, computed in lockstep with `grand_total`, not as an
independent payment instrument. A new charge has to decide, explicitly, whether it changes what
the customer pays, what the vendor is reconciled against, or both — those are not currently the
same question with the same answer.

## Options considered

### Vendor capability field

#### Option A — Boolean flag: `hasLoadingUnloadingTeam`

- **Pro:** Matches the client's literal ask ("do they have their own team or do we need extra
  resources"). One nullable boolean column, additive migration, same shape as `city_id`'s
  precedent. Zero new tables.
- **Con:** No room for nuance (partial capacity, team size, extra cost if they do have a team
  but it's slow/limited) — but nothing in the client's ask asked for that nuance either.

#### Option B — Enum: `loadingCapability` ('self' | 'needs_platform' | 'partial')

- **Pro:** Leaves room for a future "partial" case (vendor can unload but not load, etc.).
- **Con:** Speculative — the client described a binary (do they have a team or not); building
  a three-state enum for a distinction nobody asked for is exactly the kind of
  scope-creep-via-abstraction this project's own conventions warn against. Rejected.

### Checkout charge line item

#### Option A — Flat charge, read off `order_vendor_group`'s vendor at order-creation time

Add `loading_unloading_fee` (DECIMAL, default 0, nullable) to `order_vendor_group`. At
checkout, for each vendor group, if that vendor's `hasLoadingUnloadingTeam = false`, apply a
platform-set flat fee (amount TBD by client) to that group's charge and roll it into
`grand_total`.

- **Pro:** Mirrors 0033's own deferred-field pattern exactly (per-vendor-group column, filled in
  at order time). Needs no new table. The charge is naturally per-vendor because loading
  capability is a vendor-level fact — a multi-vendor cart could owe the fee for some vendor
  groups and not others, and this model expresses that correctly.
- **Con:** A flat platform-set fee is a guess at a number the client hasn't given. Needs a
  config value, not a schema decision — doesn't block the schema design, does block turning the
  charge on in production.

#### Option B — Per-vendor configurable charge (vendor sets their own fee)

- **Pro:** More "marketplace-accurate" — vendors with their own team might charge differently
  than ones needing platform labor.
- **Con:** No vendor-set-pricing-for-services concept exists anywhere in this codebase today
  (vendors price products, not services); building one is a materially bigger feature for a
  question that, per the client's own framing, is really "do we need to hire our own people,"
  not "let vendors price a service." Out of proportion to the ask. Rejected for MVP.

## Decision

> **1. Add one nullable boolean to `vendors`:** `has_loading_unloading_team` (default `null` =
> unknown, to be asked during vendor onboarding or backfilled by admin for existing vendors —
> same nullable-until-backfilled pattern as `city_id`). Exposed on `OnboardVendorDto` as
> optional and on `UpdateVendorProfileDto` for existing vendors to set later. No admin-only
> override needed beyond what `PATCH /admin/vendors/:id` already allows generally — this is a
> vendor-supplied fact, not an admin judgment call like city placement.
>
> **2. Add one nullable decimal to `order_vendor_group`:** `loading_unloading_fee` (DECIMAL
> 12,2, default `0`, CHECK `>= 0`, matching `subtotal`'s existing constraint style). Populated
> at checkout time in `checkout.service.ts`'s per-vendor-group creation loop (worktree line
> ~306-332): read the vendor's `has_loading_unloading_team`; if `false`, set the fee to a
> platform-config constant; if `true` or `null`, leave it `0`. Roll every group's fee into
> `grandTotal` alongside its subtotal, so the customer pays one number that already includes it
> — consistent with the worktree's own 0036 no-split-settlement model.
>
> **3. This does NOT get built against `main` directly.** Per 0034, the ordering domain merges
> from the worktree first; this checkout-side change lands as a small fast-follow PR against
> `main` post-merge, the same way that record structured the admin-API gap — not as a change
> inside the worktree, which risks reopening a branch that already passed its review pass.
>
> **Update 2026-10-19 — the checkout half is now built, directly in the worktree, not as a
> `main` fast-follow.** The user explicitly asked for this sequencing: build the vendor-side
> field in `main`'s PR (done, see Consequences), and build the checkout-charge logic directly
> inside `worktree-phase-3-ordering-domain` so it lands in the same PR as the rest of Phase 3
> when that worktree merges, rather than as a separate fast-follow afterward. This supersedes
> rule 3 above — kept for the record of what was originally planned, not followed. See
> Consequences for what was actually built and where.
>
> **4. The vendor-field half (`vendors` table) can be built and merged into `main` right now,
> independent of the checkout half** — it has no dependency on the ordering domain merging
> first.

## Why

Splitting the two halves by phase isn't just organizational neatness — it's forced by the fact
that the checkout code this change needs to touch doesn't exist on `main` yet. Building the
vendor flag now gives onboarding a place to start capturing the fact immediately (every vendor
onboarded between now and the Phase 3 merge gets asked), so there's no backfill gap to close
later for new vendors, only for whatever's already onboarded.

The boolean-over-enum choice follows this project's own stated preference against designing for
speculative future requirements: the client asked a yes/no question, so the schema answers a
yes/no question.

The flat-fee-into-`grand_total` design follows the worktree's own 0036 existing
no-split-settlement model rather than introducing a second kind of money (a vendor-facing-only
charge) that the payment and refund code (already reviewed and stable per 0034) doesn't know how
to reason about. Keeping the fee inside `grand_total` means Razorpay capture, refund, and the
admin-API audit work in 0034's PR 2 all keep working unmodified — the fee is just more subtotal,
not a new financial concept.

## Consequences

**As actually built (2026-10-19), superseding the original PR-split plan:**

- **PR A — merged into `main`'s PR #21** (`phase-2/vendor-loading-unloading-and-category-rename`):
  `vendors.has_loading_unloading_team` column + migration
  (`20261019090000-add-loading-unloading-capability-to-vendors.js`) + DTO fields
  (`OnboardVendorDto`, `UpdateVendorProfileDto`) + service/mapper wiring + the shared
  `@golden-abode/types` contracts. Verified against real Postgres (migration up/down/up, full
  app boot, routes mapped) before pushing.
- **PR B — built directly inside `worktree-phase-3-ordering-domain`**, not as a `main`
  fast-follow as originally planned. Two migrations ported/added there:
  `20261019090000-add-loading-unloading-capability-to-vendors.js` (the same vendor field,
  ported so the worktree is self-contained and doesn't depend on `main`'s PR #21 landing first)
  and `20261019090001-add-loading-unloading-fee-to-order-vendor-group.js` (the new
  `order_vendor_group.loading_unloading_fee` column, `DECIMAL(12,2) NOT NULL DEFAULT 0`, `CHECK
  >= 0`). `checkout.service.ts` extended: the cart-line query now joins `category` (for
  `cat.path`) and reads `v.has_loading_unloading_team`; a `loadingUnloadingFeeForLine` helper
  charges `quantity × LOADING_UNLOADING_RATE_PER_SQFT` for any tiles/stone line whose vendor's
  flag is not `true` (NULL treated as `false` — charge defensively until the vendor answers);
  the total is rolled into both `grandTotal` (what the customer pays) and each group's new
  `loadingUnloadingFee` column. `LOADING_UNLOADING_RATE_PER_SQFT` is a placeholder constant
  (`0`) until the client gives a real rate. Verified against real Postgres in the worktree
  (migration up/down/up, the new `category`/`vendors` join tested directly against live data,
  full app boot with `/api/checkout` mapped).
- **A client decision blocks the fee amount, not its schema or wiring.** Both are built and
  will compute correctly the moment `LOADING_UNLOADING_RATE_PER_SQFT` is set to a real number —
  same pattern 0034 used for the reservation-sweep timeout (build the mechanism, gate the
  dangerous unknown behind a config value that isn't guessed at).
- **Existing vendors have `has_loading_unloading_team = null` until asked or backfilled** — this
  is a real gap (no fee applies to any existing vendor's orders until that vendor's flag is
  set, though the NULL-treated-as-`false` default means the fee still charges defensively for
  eligible lines), named here so it isn't discovered as a surprise later.
- **Admin's bulk vendor list/edit screens should surface this flag** once Phase 4's Admin
  Dashboard work starts, but that's Phase 4 scope per 0035 and not part of either PR here.
- **The worktree's own PR, when it merges, carries this fee logic with it** — there is no
  separate fast-follow PR to track for the checkout half anymore; what's left is only setting
  the real rate constant once the client gives one.

## Open questions

- **The exact rate (₹ per sqft).** Not an engineering decision, needs the client. Everything
  else in the per-sqft design (Addendum) can be built with a placeholder rate and switched on
  once given.
- **One global rate, or one rate per category (tiles vs. stone)?** Assumed single rate per the
  Addendum's reading of "price per sq ft" — confirm with the client before shipping if there's
  any chance tiles and stone are priced differently.
- **Whether `has_loading_unloading_team = null` (unknown) should block checkout** for that
  vendor's tile/stone lines, or default to charging the fee defensively until set. Leaning
  toward defaulting to "charge the fee" (fail toward the platform doing the work) but not
  decided here.
- **Does the per-sqft fee apply to the whole line regardless of partial quantity changes**
  (e.g., a customer buying 3.5 sqft of tile) — assumed yes, same fractional-quantity handling
  the catalog already uses for sqft-denominated stock (`vendor-stock.dto.ts:37` already allows
  fractional quantities for this exact reason).

## Sources

- `apps/backend/src/modules/vendors/models/vendor.model.ts`,
  `vendor-account-details.model.ts`
- `apps/backend/database/migrations/20260630000000-create-vendors.js`,
  `20260828090002-add-city-id-to-vendors.js`, `20260902090000-add-city-source-to-vendors.js`
- `apps/backend/src/modules/vendors/dto/onboard-vendor.dto.ts`,
  `dto/update-vendor-profile.dto.ts`
- `apps/backend/src/modules/vendors/vendors.controller.ts`, `vendors.service.ts`
  (`createProfile` ~:50, `updateProfile` ~:118, `setVendorCity` ~:215)
- Worktree `worktree-phase-3-ordering-domain`:
  `apps/backend/src/modules/orders/checkout.service.ts` (~:294, ~:306-332, ~:356),
  `apps/backend/database/migrations/20261008090003-create-orders-domain.js`,
  `models/order-vendor-group.model.ts`
- Phase 3 worktree's own `0036-cart-and-order-structure.md` (not present in this branch's
  `docs/decisions/` — see numbering note above) — deferred-field table, no-split-settlement
  consequence
- `0034-phase-3-ordering-domain-completion.md` (this project's own, on `main`) —
  merge-first-fast-follow-second pattern this record originally reused, before the Update
  above changed the checkout half to be built directly in the worktree instead
