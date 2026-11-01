# 0051 — Mobile-dev artisan gaps, Batch A (contained backend fixes)

- **Date:** 2026-11-01
- **Status:** Implemented
- **Supersedes / Superseded by:** —

## Context

The mobile developer building the artisan module UI (per the handover doc published from
decision 0045/0046's work) reported ten gaps between the documented API surface and what the
app actually needs. Each claim was independently verified against `origin/main` (commit
`96b4948`) before any code changed — see the verification transcript in this session; all ten
were confirmed accurate, two with minor nuance (notification code exists but only logs, team
document persistence exists but has no dedicated upload flow).

The ten items split into two batches by size and risk, per user direction:

**Batch A (this record) — contained, backend-only, no design decisions needed:**

4. No endpoint to fetch a single hire request by id directly (only via list).
5. An artisan cannot open the detail of an order attributed to their hire request — order
   detail was customer-only.
6. `docs/artisan.md` says service pincode is required at onboarding; the API allowed it empty.
7. The backend never checked `artisan.isAvailable` when a customer tries to hire — only the
   mobile UI's disabled button enforced it.
8. Confirmed-correct as already built: only verified artisans are hireable (404 if not) — no
   change needed, listed here only because it was one of the ten claims checked.

**Batch B (separate, deferred) — needs product/design decisions before implementation:**

1. No customer-facing artisan browse/search endpoint.
2. Hire-request approval is web-admin-only, and the only "notification" is a server log line
   (`LogNotificationService`) — no real push notification exists.
3. Team-member document persistence exists but has no dedicated presign/confirm upload flow
   (the lead artisan's own KYC flow must be reused to mint a valid key first).

Items 8 and 10 required no code change: #8 (separate `isApproved`/`isVerified` admin gates) is
already-correct existing behavior; #10 (no recommendations/rewards endpoints) is accurate and
intentional — decision 0046 is still "Proposed," and rewards remain explicitly out of scope per
the user's standing direction.

This record covers Batch A only.

## Options considered

### Error shape for hiring an unavailable artisan (item 7)

#### Option A — 409 Conflict with a specific message

- **Pro:** The artisan genuinely exists and is verified — the customer already saw
  `isAvailable` on the public profile before attempting to hire, so hiding the real reason
  behind a generic 404 (as the `isVerified` gate deliberately does) would serve no purpose here.
  A clear 409 tells the customer why in one round trip.
- **Con:** None material.

#### Option B — 404, matching the existing `isVerified` gate exactly

- **Pro:** One uniform "hiring failed" shape across both gates.
- **Con:** `isVerified`'s 404 is deliberately indistinguishable from "doesn't exist" because an
  _unverified_ artisan shouldn't be discoverable at all (spec §5). An _available_ artisan is
  fully discoverable and already visible to the customer — collapsing a real, informative
  distinction into the same opaque 404 as the unverified case loses information for no privacy
  benefit.

**Decision: Option A.** Confirmed with the user.

### Route design for the single-hire-request read (item 4)

#### Option A — `GET /artisans/hire-requests/:id`, reusing existing ownership-check plumbing

- **Pro:** `HireRequestsService.getRequestById` (model lookup) and
  `ArtisansController.assertCanViewHireRequest` (owning customer / owning artisan / admin) both
  already exist and are already used by the two existing sub-resource reads
  (`:id/estimates`, `:id/orders`) — this is the same shape a third time, not new design.
- **Con:** Needs careful route-registration ordering so the new bare `:id` route doesn't shadow
  the existing more-specific `:id/estimates` and `:id/orders` routes.

**Decision: Option A**, with the new route registered _before_ the two sub-resource routes in
source order (Nest/Express resolve two same-position dynamic segments by registration order,
unlike a static-vs-dynamic case where the static segment always wins regardless of order).

### How an artisan reaches order detail (item 5)

#### Option A — Extend `OrdersService.getForCustomer` into a role-branching `getForOwner`

- **Pro:** Both paths converge on an identical shape — find one order, 404 if not owned, map to
  the same `OrderDto` — just with a different ownership test (`customerId` match vs.
  `bookingId` → owning hire request → owning artisan). The controller only needs to know the
  caller's own role, not which branch to pick itself.
- **Con:** `OrdersService` gains a new dependency on the `Artisan` and `ArtisanHireRequest`
  models — mitigated by the same "independent `SequelizeModule.forFeature` registration, no
  module-to-module import" pattern decision 0045 already established between `OrdersModule` and
  `ArtisansModule` (confirmed no circular dependency results, same reasoning as that record).

#### Option B — A separate `GET /artisans/hire-requests/:id/orders/:orderId` route, scoped

inside the artisans module instead of extending `orders`

- **Pro:** Keeps `OrdersController`'s existing `@Roles(Role.CUSTOMER)` class-level gate
  untouched.
- **Con:** Splits one concept (order detail) across two different URL shapes depending on who's
  asking, which the mobile client would have to know and branch on itself — worse ergonomics
  for exactly the audience (mobile dev) this batch exists to help. The artisan's `OrderDto`
  response needs to be identical either way, so nothing is actually saved by keeping it a
  separate route.

**Decision: Option A.** `GET /orders/:id` keeps its one URL; the controller's class-level
`@Roles(Role.CUSTOMER)` gets a method-level override (`@Roles(Role.CUSTOMER, Role.ARTISAN)`) on
this one route, matching the existing precedent for method-level role overrides elsewhere in
this codebase (`ArtisansController`'s own mixed-role routes). 404, not 403, for every failure
mode on the artisan path (no artisan profile, order not found, order not attributed to any hire
request, attributed to someone else's) — same "don't distinguish doesn't-exist from not-yours"
reasoning this codebase already uses elsewhere (`ArtisansService.getPublicProfile`,
`HireRequestsService.cancel`'s ownership checks).

### Pincode: fix the API or fix the docs (item 6)

Confirmed with the user: fix the API to match the docs (require it), not the reverse. The
mobile app had already independently made it a required field client-side — the API was the
one side out of step, and the docs already specified the correct, intended behavior
(`docs/artisan.md` §3 Step 1: "✅ Required").

## Decision

> 1. **`GET /artisans/hire-requests/:id`** — new route on `ArtisansController`, reusing
>    `getRequestById` + `assertCanViewHireRequest`, mapped through a new
>    `HireRequestsService.getHireRequestDto(id)` (wraps the existing `toHireRequestDto` +
>    `latestEstimateFor`, mirroring how `getEstimateHistory`/`listAttributedOrders` are already
>    structured — the controller resolves ownership, the service only maps). Registered before
>    the `:id/estimates` and `:id/orders` sub-routes.
> 2. **`OrdersService.getForOwner(userId, role, orderId)`** — dispatches to the existing
>    `getForCustomer` for `Role.CUSTOMER`, or a new private `getForArtisan` for `Role.ARTISAN`
>    that resolves the caller's `Artisan` row, loads the order, and checks
>    `order.bookingId` → `ArtisanHireRequest.artisanId` matches. `OrdersController.getOrder`
>    gains `@Roles(Role.CUSTOMER, Role.ARTISAN)` and calls `getForOwner` instead of
>    `getForCustomer` directly. `OrdersModule` registers the `Artisan` model via its own
>    `SequelizeModule.forFeature` (matching the existing `ArtisanHireRequest` registration from
>    decision 0045).
> 3. **`OnboardArtisanDto.servicePincode`** — dropped `@IsOptional()`, kept
>    `@IsString() @IsNotEmpty()`; `ApiPropertyOptional` → `ApiProperty`. The shared
>    `ArtisanOnboardDto` contract type (`packages/types/src/artisan.types.ts`) keeps its own
>    `?` — that type is also used for read/update contexts where optional is still correct;
>    only this one onboarding DTO's validation tightened.
> 4. **`HireRequestsService.createRequest`** — added `if (!artisan.isAvailable) throw new
ConflictException(...)` immediately after the existing `isVerified` check.

Every item above was built test-first: new DTO validation spec
(`onboard-artisan.dto.spec.ts`), new service-level unit tests for `getForOwner`
(`orders.service.spec.ts`), new HTTP-level controller tests for the single-hire-request read and
the 409 (`artisans.controller.spec.ts`). 34 pre-existing HTTP test fixtures across
`artisans.controller.spec.ts` and `admin-artisans.controller.spec.ts` needed `servicePincode`
added to their profile-creation payloads once the DTO validation tightened; 10 more in
`artisans.service.spec.ts` needed the same at the TypeScript level (the service method's
parameter type is the DTO class itself, so a missing required field is now a compile error,
not just a runtime validation failure).

## Why

Reusing existing ownership-check plumbing (items 1 and 2's chosen options) rather than inventing
new authorization logic per endpoint keeps the authorization surface small and consistently
reasoned about — every "can this caller see this hire request / this order" question in the
codebase now resolves through one of two established patterns
(`assertCanViewHireRequest` for hire-request reads, `getForOwner`'s role branch for order
reads), not four or five slightly different ones.

The 409-vs-404 split (item 7) encodes a real distinction the codebase already draws elsewhere:
404 means "you should not be able to tell whether this exists" (unverified artisans, hire
requests you don't own); 409 means "this exists, you can see it, but the requested action
conflicts with its current state" (the same shape `HireRequestsService.claimTransition` already
uses for status-conflict errors). Available-but-already-visible is the second case, not the
first.

## Consequences

- `OrdersModule` now depends on two artisan models (`Artisan`, `ArtisanHireRequest`) via
  independent `forFeature` registration — the same pattern, now used twice, that decision 0045
  established once. A third such cross-registration would be worth asking whether `ArtisansModule`
  should simply export `SequelizeModule` itself (as `CatalogModule` already does), rather than
  every consumer re-registering piecemeal — not changed here, flagged for whoever adds the next
  one.
- `OnboardArtisanDto.servicePincode` becoming required is a breaking change for any client that
  was previously omitting it — none exist in production yet (artisan onboarding is unreleased
  mobile-side), so no migration/backfill concern, but worth noting if any existing artisan rows
  in a deployed environment have `service_pincode = NULL` from before this change: those rows
  are untouched (this only affects new onboarding calls), and nothing reads `servicePincode` as
  if it were guaranteed non-null elsewhere in the codebase.
- Decision numbering: this is `0051` deliberately, not `0047` — local, not-yet-pushed work on
  this machine already claimed `0047`–`0050` for unrelated features (delivery module flag,
  vendor approval status, stale-reservation sweep, admin password reset). Flagging here so
  whoever merges both branches doesn't have to puzzle out why the sequence jumps.

## Open questions

- Batch B (browse/search, real push notifications, team-document upload flow) is deliberately
  not designed here — each needs its own scoping pass with explicit decisions (search index vs.
  simple filtered list; which push provider; whether team-member documents deserve the same
  presign/confirm rigor as the artisan's own KYC doc, or a simpler scheme).
- Whether any artisan rows already exist in a deployed environment with a null
  `service_pincode` that would benefit from a backfill prompt — not investigated here, flagged
  only.

## Sources

- [docs/artisan.md](../artisan.md) §3 Step 1
- [0045-artisan-hire-lifecycle-and-order-attribution.md](0045-artisan-hire-lifecycle-and-order-attribution.md)
  (the `OrdersModule`/`ArtisansModule` independent-registration precedent)
- `apps/backend/src/modules/artisans/artisans.controller.ts`,
  `hire-requests.service.ts` (`getRequestById`, `assertCanViewHireRequest`,
  `createRequest`)
- `apps/backend/src/modules/orders/orders.controller.ts`, `orders.service.ts`
  (`getForCustomer`, new `getForOwner`/`getForArtisan`)
- `apps/backend/src/modules/artisans/dto/onboard-artisan.dto.ts`
- Mobile developer's gap report (this session, 2026-11-01), independently verified claim-by-claim
  against `origin/main` commit `96b4948` before any item was actioned
