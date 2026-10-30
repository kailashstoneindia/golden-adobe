# 0046 — Artisan product recommendations

- **Date:** 2026-10-30
- **Status:** Proposed — ready to execute, pending user go-ahead on sequencing
- **Supersedes / Superseded by:** —

## Context

[docs/artisan.md](../artisan.md) §2's Path B is the whole point of hiring an artisan: the
artisan visits, assesses the job, and recommends specific platform products for the customer to
order. [0045](0045-artisan-hire-lifecycle-and-order-attribution.md) built everything up to that
point — a customer can hire a verified artisan, admin approves it, the artisan can start/complete
the job, and a resulting checkout can now be attributed back to the engagement via
`orders.booking_id`. But nothing today lets the artisan actually make a recommendation, or lets
the customer see one. `docs/artisan.md` §4's `artisan_recommendations` table (Phase 2) was never
built — confirmed by a repo-wide search for "recommendation" during 0045's own scoping, which
found zero references anywhere in `apps/backend`, `apps/admin`, or `packages/types`.

Rewards/points attribution (docs/artisan.md §7, `artisan_rewards_ledger`) remains explicitly out
of scope per the user's standing direction — this record does not touch it, and nothing here
depends on it existing.

This record is backend-only, matching how 0045 was scoped; admin and mobile UI for
recommendations are named as follow-on work, not designed here.

## Options considered

### What a recommendation points at

#### Option A — Abstract product (`masterProductId`) only

- **Pro:** Matches how an artisan actually shops — "use tiles like this one," not "buy this
  exact seller's stock." A `MasterProduct` is catalog-wide and stable; it doesn't go stale when
  a vendor pauses a listing or runs out. The customer still gets full value by tapping through
  to the existing `GET /search/:masterProductId/listings` endpoint (confirmed during 0045's
  research: public, unauthenticated, already returns every seller of one product in the
  customer's resolved city, cheapest first) to pick a vendor themselves.
- **Con:** One extra tap for the customer versus a direct add-to-cart.

#### Option B — Specific vendor listing (`vendorListingId`)

- **Pro:** Customer can add to cart in one tap directly from the recommendation.
- **Con:** A recommendation silently breaks (or must be re-validated at read time) if that
  vendor's listing is later paused, goes out of stock, or is deleted — the artisan's
  recommendation was never about one seller, it was about a product. This also couples a
  cross-module read (recommendations → vendor listings → inventory) that Option A avoids
  entirely.

**Decision: Option A.** Confirmed with the user. A recommendation is `{ hireRequestId,
masterProductId, suggestedQty, note }` — nothing else.

### Recommendation entity shape — append-only vs. mutable

#### Option A — Mutable child entity (full CRUD), matching `ArtisanTeamMember`

- **Pro:** An artisan can fix a typo'd quantity or remove a recommendation made in error, without
  leaving stale/wrong data visible to the customer. Matches `ArtisanTeamMember`'s existing
  add/update/remove shape exactly (`ArtisansService.addTeamMember`/`updateTeamMember`/
  `removeTeamMember`, `artisans.controller.ts`) — same ownership checks, same DTO-derivation
  pattern (`UpdateTeamMemberDto extends PartialType(CreateTeamMemberDto)`).
- **Con:** None material — a recommendation has no append-only requirement the way a completion
  estimate's "never overwrite history" rule does (spec §8.2/§8.4). There is no equivalent "full
  revision history" need for a recommendation; it is a current, editable list, not a log.

#### Option B — Append-only, matching `ArtisanCompletionEstimate`

- **Pro:** Simpler to reason about — no update/delete code paths, no ownership-of-mutation
  checks beyond create.
- **Con:** Wrong fit. Estimates are append-only because the *history of estimates* is the point
  (§8.2: "always appends, never overwrites"). A recommendation has no such history requirement —
  what matters is "what does the artisan currently recommend," which an append-only log would
  force the customer-facing read to compute (latest-per-product, or worse, show every stale
  duplicate) for no benefit.

**Decision: Option A**, mirroring `ArtisanTeamMember` structurally: a mutable child entity with
full CRUD, owned by the artisan, scoped to one hire request.

### Recommendation window (which hire-request statuses allow it)

Confirmed with the user: `ACCEPTED_BY_ARTISAN` or `IN_PROGRESS` only — reusing
`HireRequestsService.ACTIVE_ENGAGEMENT_STATUSES` exactly as-is (no new constant), the same gate
`addEstimate` already uses. Once `COMPLETED` or `CANCELLED`, no new recommendations — but
existing ones remain visible and orderable (the booking-attribution window from 0045 already
extends through `COMPLETED`, independently of this gate).

## Decision

> **One batch, backend-only:**
>
> 1. **Migration**: new `artisan_recommendations` table — `id`, `hire_request_id` (FK →
>    `artisan_hire_requests.id`, `onDelete: CASCADE`, indexed), `master_product_id` (FK →
>    `master_products.id`, `onDelete: RESTRICT` — a recommendation should not silently vanish if
>    a product is ever deleted; that is a data-integrity decision for the catalog module to make
>    deliberately, not a side effect of this table), `suggested_qty` (INTEGER, default 1, matches
>    `ArtisanCompletionEstimate`'s plain-integer convention, no decimal precision needed),
>    `note` (TEXT, nullable), full `timestamps: true` (unlike completion estimates — this is
>    mutable, so `updated_at` is meaningful here).
> 2. **Model**: `ArtisanRecommendation`, structurally identical to `ArtisanTeamMember`
>    (`@BelongsTo(() => ArtisanHireRequest)`, indexed FK) plus a `@BelongsTo(() => MasterProduct)`
>    for the product reference.
> 3. **Service methods** on `HireRequestsService` (not a new service — recommendations are a
>    hire-request-scoped concern, same reasoning that keeps estimates on this service rather than
>    a dedicated one):
>    - `addRecommendation(artisanUserId, hireRequestId, dto)` — ownership check (same pattern as
>      `addEstimate`), `ACTIVE_ENGAGEMENT_STATUSES` gate, validates `masterProductId` exists
>      (404 otherwise — matches `createRequest`'s existing "validate the foreign reference up
>      front" convention), then `.create()`.
>    - `updateRecommendation(artisanUserId, hireRequestId, recommendationId, dto)` — ownership
>      check, partial update (`suggestedQty`/`note` only — `masterProductId` is not
>      re-pointable; delete and re-add instead, same reasoning `UpdateArtisanProfileDto` never
>      lets a field change identity, only its attributes).
>    - `removeRecommendation(artisanUserId, hireRequestId, recommendationId)` — ownership check,
>      `.destroy()`.
>    - `listRecommendations(hireRequestId)` — shared read, no artisan/customer distinction in the
>      data itself (unlike `ArtisanProfileDto` vs `ArtisanPublicProfileDto`'s bio-only split —
>      there is no sensitive field here to hide from a customer).
> 4. **Controller routes** on `ArtisansController`, mirroring the team-member block exactly:
>    - `POST /artisans/me/hire-requests/:id/recommendations` (artisan)
>    - `PATCH /artisans/me/hire-requests/:id/recommendations/:recId` (artisan)
>    - `DELETE /artisans/me/hire-requests/:id/recommendations/:recId` (artisan)
>    - `GET /artisans/hire-requests/:id/recommendations` (shared: owning customer, owning
>      artisan, or admin — same `assertCanViewHireRequest` reuse as `getEstimateHistory` and
>      0045's `getAttributedOrders`)
> 5. **DTOs**: `CreateRecommendationDto { masterProductId: string; suggestedQty?: number; note?:
>    string }`, `UpdateRecommendationDto extends PartialType(OmitType(CreateRecommendationDto,
>    ['masterProductId']))` — `masterProductId` deliberately excluded from the update shape per
>    item 3's "not re-pointable" rule, enforced at the type level, not just by convention.
> 6. **Shared types** (`packages/types/src/artisan.types.ts`): `ArtisanRecommendationDto`,
>    `CreateRecommendationDto`, `UpdateRecommendationDto`, each carrying `masterProductName` and
>    `masterProductCode` snapshotted onto the DTO at read time (not stored denormalized — looked
>    up via the `MasterProduct` association, same as `OrderItemDto.productName`/`productCode`
>    already do for `MasterProduct`) so a customer-facing list never needs a second round trip to
>    show what's recommended.

## Why

Keeping recommendations on `HireRequestsService` rather than spinning up a new service matches
this module's existing boundary: everything scoped to one hire request (estimates, and now
recommendations) lives together; everything scoped to the artisan's own profile (team, account
details) lives on `ArtisansService`. A recommendation is unambiguously the former.

Snapshotting the product's name/code onto the read DTO (item 6) rather than requiring every
caller to separately fetch `MasterProduct` mirrors `OrderItemDto`'s own established pattern in
this exact codebase (`order-display.mapper.ts:toOrderItemDto`) — consistency with a pattern
already proven for "here's a product reference, show its name without a second request" beats
inventing a different convention for a structurally identical problem.

Excluding `masterProductId` from the update DTO at the type level (item 5) rather than leaving it
optional-but-ignored prevents a class of bug where a client sends it anyway and a future
maintainer wires it through without noticing it was never meant to be mutable — the type itself
documents the rule.

## Consequences

- One new table, one new model, no changes to any existing table (unlike 0045 Batch 2, which
  added a column to `orders`) — this is purely additive.
- `ArtisanHireRequestDto` is unaffected — recommendations are read via their own endpoint
  (`listRecommendations`), not embedded on every hire-request read, matching how `estimates` are
  already handled (`latestEstimate` inline for list views, full history via a dedicated
  endpoint) — but unlike estimates, even the inline case is skipped here since recommendations
  have no obvious "latest one" to summarize (there can be several, for different products,
  simultaneously current).
- `MasterProduct` is already injectable into `ArtisansModule` with no new work: confirmed by
  reading `catalog.module.ts` directly — `CatalogModule` exports `SequelizeModule` itself
  (`exports: [SequelizeModule, ...]`), which re-exports every repository token its own
  `forFeature` call registered, including `MasterProduct`. `ArtisansModule` already imports
  `CatalogModule` (for `OBJECT_STORAGE`), so `@InjectModel(MasterProduct)` will resolve in
  `HireRequestsService` with zero module changes — unlike 0045's `Order`/`ArtisanHireRequest`
  case, which needed each module to add its own independent `forFeature` registration because
  neither `OrdersModule` nor `ArtisansModule` exports `SequelizeModule` itself.
- Once this exists, a future "which recommended products turned into which order lines"
  cross-reference (recommendation → order item, by `masterProductId` + the order's
  `booking_id`) becomes possible without further schema changes — not built here, just no longer
  blocked.

## Open questions

- Whether `suggestedQty`'s unit should ever need to differ from the product's own sale unit
  (e.g. recommending "20" of a per-sqft tile vs. "20" boxes) — out of scope here; `suggestedQty`
  is a plain integer with no unit semantics attached, same ambiguity `OrderItem.quantity`
  already carries elsewhere in this codebase, not a new gap.
- Whether removing a recommendation should be blocked once an order has been placed against that
  same `masterProductId` under this booking (to preserve a record of "this is what led to that
  order") — not designed here; current decision allows removal unconditionally, consistent with
  `ArtisanTeamMember.removeTeamMember`'s own no-history-preserved behavior.
- Admin and mobile UI are not designed here — backend only, per the user's framing of this
  request, same scoping 0045 used.

## Sources

- [docs/artisan.md](../artisan.md) §2, §4–5
- [0045-artisan-hire-lifecycle-and-order-attribution.md](0045-artisan-hire-lifecycle-and-order-attribution.md)
- `apps/backend/src/modules/artisans/models/artisan-team-member.model.ts`,
  `artisan-completion-estimate.model.ts` (the two structural precedents compared above)
- `apps/backend/src/modules/artisans/hire-requests.service.ts` (`ACTIVE_ENGAGEMENT_STATUSES`,
  `addEstimate`'s ownership/status-gate pattern)
- `apps/backend/src/modules/artisans/dto/create-team-member.dto.ts`,
  `update-team-member.dto.ts` (the `PartialType`-derivation convention)
- `apps/backend/src/modules/orders/order-display.mapper.ts` (`toOrderItemDto`'s
  product-name/code snapshotting precedent)
- `apps/backend/src/modules/catalog/models/master-product.model.ts`
- `apps/backend/src/modules/search/search.controller.ts` (`GET
  /search/:masterProductId/listings` — the customer-facing follow-through path, confirmed public
  during 0045's own research)
