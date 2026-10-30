# 0045 — Artisan hire-request lifecycle completion and order attribution

- **Date:** 2026-10-30
- **Status:** Implemented — Batch 1 and Batch 2 both complete on `feature/artisan-hire-lifecycle` (backend only; admin UI and mobile not started — see the addendum below)
- **Supersedes / Superseded by:** —

## Context

[docs/artisan.md](../artisan.md) and the current `artisans` module already deliver a working
customer→artisan hiring pipeline, backend-only: a customer can create a hire request, an admin
can approve or reject it, and the artisan only sees it once approved. That much is live and
correct (`HireRequestsService.createRequest` / `reviewRequest`,
`apps/backend/src/modules/artisans/hire-requests.service.ts`).

Two things stop that pipeline from being a complete, trackable engagement for every party
(admin, customer, artisan) rather than just an approval gate:

1. **No lifecycle past approval.** `ArtisanHireRequestStatus` already defines six states —
   `PENDING_ADMIN_REVIEW`, `ADMIN_REJECTED`, `ACCEPTED_BY_ARTISAN`, `IN_PROGRESS`, `COMPLETED`,
   `CANCELLED` — and the DB enum and model already support all six
   (`artisan-hire-request.model.ts`, migration `20261029090003-create-artisan-hire-requests.js`).
   `ACTIVE_ENGAGEMENT_STATUSES = new Set(['ACCEPTED_BY_ARTISAN', 'IN_PROGRESS'])`
   (`hire-requests.service.ts:27`) already anticipates `IN_PROGRESS` being reachable. But there
   is **no endpoint anywhere** that moves a request from `ACCEPTED_BY_ARTISAN` to `IN_PROGRESS`,
   or into a terminal `COMPLETED`/`CANCELLED`. Once admin approves, the record is permanently
   stuck in `ACCEPTED_BY_ARTISAN` from the system's point of view — no party can mark the job
   started, finished, or called off, and admin has no way to see which engagements are actually
   active vs. done.
2. **No link from the engagement to an order.** `docs/artisan.md` §4–5 describes the whole point
   of hiring an artisan (Path B): the artisan visits, recommends products, and the resulting
   order should be attributable back to them (`orders.booking_id`). Today `Order` has no such
   column (`apps/backend/src/modules/orders/models/order.model.ts`) and checkout
   (`CheckoutService.checkout`, `apps/backend/src/modules/orders/checkout.service.ts:85`) takes
   only `{ deliveryAddressId }` — there is no way to associate a checkout with a hire request, so
   even a fully completed engagement leaves no trace in the orders table.

The rewards ledger (`artisan_rewards_ledger`, docs/artisan.md §4/§7) is explicitly **out of
scope** for this record per the user's direction — it depends on an unresolved client decision
(points: fixed vs. percentage of GMV) and is not needed to make the hiring pipeline trackable.
This record is scoped to: lifecycle transitions + order attribution + the admin/customer/artisan
visibility needed to track both, nothing else.

## Options considered

### How to shape the lifecycle transition endpoints

#### Option A — Named transition endpoints (one per transition)

- **Pro:** Matches the only existing precedent in this exact module —
  `PATCH .../hire-requests/:id/review`, `PATCH .../artisans/:id/verify`,
  `.../reject-verification` are all named, single-purpose endpoints, not a generic
  `{status}` PATCH. Each transition can carry its own role gate, its own request body shape
  (e.g. `CANCELLED` needs a reason; `IN_PROGRESS`/`COMPLETED` don't), and its own guard logic
  without a shared validation table that has to cover every case generically.
- **Con:** More endpoints to wire (3 new: `start`, `complete`, `cancel`) versus 1.

#### Option B — Single `PATCH .../hire-requests/:id/status` with a target-status body

- **Pro:** Fewer routes; mirrors `VendorsController`'s
  `PATCH /vendors/order-groups/:id/status` + a server-side `validNextStatuses` table
  (`OrdersService.updateVendorGroupStatus`, `orders.service.ts`).
- **Con:** That pattern is reserved in this codebase for a single actor's own forward-only
  progression (the vendor advancing their own fulfilment). Here, different transitions belong
  to different actors — the artisan starts/completes the job, either the customer or the
  artisan can cancel it, admin can override — so one endpoint would immediately need per-target
  role branching inside the handler, which is just Option A's dispatch logic hidden behind one
  route instead of expressed in the routing.

### How to attribute an order to a hire request

#### Option A — Nullable `booking_id` column directly on `orders`

- **Pro:** Exactly what `docs/artisan.md` §4 already specifies (`orders.booking_id REFERENCES
  service_bookings(id)`), adjusted to reference `artisan_hire_requests.id` directly since this
  codebase never built a separate `service_bookings` table — the hire request **is** the
  booking. One column, one index, no new table. `NULL` = Path A (direct order), set = Path B.
- **Con:** `Order` can span multiple vendors via `OrderVendorGroup`
  (`order-vendor-group.model.ts`) but only one hire request — fine, since one checkout is one
  cart and a customer only has one active engagement with one artisan at a time per request, but
  worth stating explicitly so it's not re-litigated later.

#### Option B — New `artisan_recommendations` join table first, attribution derived from it

- **Pro:** Matches docs/artisan.md's Phase 2 schema literally (`artisan_recommendations` linking
  booking → product → artisan, separate from `orders.booking_id`).
- **Con:** Conflates two different features. Attribution ("this order came from this hire
  request") does not require knowing *which specific products* were recommended — that's a
  richer feature (artisan proposes products, customer picks from them) that can be built later,
  on top of the `booking_id` column, without changing the column's meaning. Building the join
  table first with no attribution column yet to point at it is backwards.

## Decision

> **Two independent batches, both backend-only, no dependency between them (can ship in either
> order or in parallel):**
>
> **Batch 1 — Hire-request lifecycle completion**
>
> 1. Add three named transition endpoints to `ArtisansController`
>    (`apps/backend/src/modules/artisans/artisans.controller.ts`), following the
>    `reviewRequest`/`verify`/`reject-verification` precedent exactly (conditional UPDATE
>    guarded by current status, same `affected === 0` → 404-vs-409 disambiguation
>    `reviewRequest` already uses):
>    - `PATCH /artisans/me/hire-requests/:id/start` — `Role.ARTISAN` only, owning artisan only.
>      `ACCEPTED_BY_ARTISAN → IN_PROGRESS`.
>    - `PATCH /artisans/me/hire-requests/:id/complete` — `Role.ARTISAN` only, owning artisan
>      only. `IN_PROGRESS → COMPLETED`.
>    - `PATCH /artisans/hire-requests/:id/cancel` — `Role.CUSTOMER` (owning customer) or
>      `Role.ARTISAN` (owning artisan) or `Role.ADMIN`, reusing the same
>      `assertCanViewHireRequest`-style ownership check already in the controller. Legal from
>      `PENDING_ADMIN_REVIEW`, `ACCEPTED_BY_ARTISAN`, or `IN_PROGRESS` → `CANCELLED`. Requires a
>      `reason` string in the body (logged, same log-only pattern `rejectVerification` uses —
>      no new persisted-reason column, matching this module's existing convention).
> 2. Add `startedAt`/`completedAt`/`cancelledAt` nullable timestamp columns (migration, same
>    style as the existing artisan migrations: explicit FK/index where relevant, snake_case,
>    symmetric `down`) so admin and both parties can see *when* each transition happened, not
>    just the current status — needed for the dashboard/tracking ask, not just the state machine
>    itself.
> 3. Wire `NotificationService` calls (extending the interface in
>    `apps/backend/src/modules/notifications/notification.interface.ts`, implemented today only
>    by the log-only `LogNotificationService`) on every transition in this batch, plus on the
>    existing `reviewRequest` approve/reject, so hire-request status changes stop being silent —
>    today only `listForArtisan`'s visibility filter stands in for "the artisan was notified,"
>    which is not notification, it's just query scoping. This closes that gap for all parties at
>    once rather than leaving it unfixed as new transitions are added on top.
> 4. Add an admin list/detail surface for hire requests beyond "pending only": extend
>    `AdminArtisansController` with `GET /admin/artisans/hire-requests` (all statuses, filterable
>    by `status` query param) so admin can track active/completed/cancelled engagements, not
>    only the review queue. (`GET .../pending` already exists and is untouched.)
>
> **Batch 2 — Order-to-hire-request attribution**
>
> 5. Migration: nullable `booking_id` (FK → `artisan_hire_requests.id`, `onDelete: SET NULL`,
>    indexed) on `orders`. Decision Option A above — no new `service_bookings`/
>    `artisan_recommendations` table yet; the hire request is the booking.
> 6. Extend `CheckoutDto` (`apps/backend/src/modules/orders/dto/checkout.dto.ts`) with an
>    optional `bookingId?: string`, validated in `CheckoutService.checkout` against: the hire
>    request exists, belongs to the calling customer, and is in an active-or-completed state
>    (`ACCEPTED_BY_ARTISAN`, `IN_PROGRESS`, or `COMPLETED` — not `PENDING_ADMIN_REVIEW`,
>    `ADMIN_REJECTED`, or `CANCELLED`). Stamp `booking_id` onto the created `Order` row inside
>    the same transaction checkout already uses.
> 7. Surface the linkage both directions: `ArtisanHireRequestDto` gains an optional
>    `attributedOrderIds: string[]` (or a dedicated endpoint,
>    `GET /artisans/hire-requests/:id/orders`) so the artisan/customer/admin can see which orders
>    came from a given engagement; order read paths (`OrderDto` /
>    `AdminOrdersController`/`OrdersController` detail responses) gain the `bookingId` they
>    already have as a column, once added.
> 8. Admin visibility: add `bookingId`/linked-hire-request info to whatever admin order detail
>    view already exists, so an order placed via an artisan engagement is identifiable in the
>    existing admin orders screen, not just via a new dedicated page.

## Why

Batch 1 is sequenced to not strictly block Batch 2, but is listed first because it is the
smaller, more self-contained gap — three endpoints plus timestamps plus notification wiring,
entirely inside the `artisans` module, with a near-exact existing pattern to copy
(`reviewRequest`'s conditional-UPDATE shape). Named transition endpoints (Option A) were chosen
over a generic `{status}` PATCH (Option B) because the actors differ per transition (artisan
starts/completes; customer, artisan, or admin can cancel) — expressing that in routing/guards
per endpoint is more legible and auditable than a single endpoint with a status-to-role
dispatch table buried in the handler, and it matches what this exact module already does for
`review`/`verify`/`reject-verification`.

Batch 2's `booking_id`-on-`orders` approach (Option A) was chosen over building the full
`artisan_recommendations` table first (Option B) because attribution and recommendation are
separable features: knowing an order came from a hire request does not require a product-level
recommendation record to already exist. Building the attribution column first means Batch 2
ships value (trackability — "did this hire turn into a sale?") immediately, and a later
recommendation feature can be layered on top of `booking_id` without revisiting this batch.

Both batches are deliberately silent on `artisan_rewards_ledger` per the user's explicit
out-of-scope direction — points logic needs a client decision this record does not make, and
nothing in either batch requires it to exist.

## Consequences

- Four small PRs, matching this project's established granularity (see 0037, 0034, 0036):
  (1) lifecycle transitions + timestamps, (2) notification wiring, (3) admin hire-request
  list/detail, (4) order attribution (migration + checkout + surfacing). Items (1)–(3) can be
  one PR if preferred; (4) is independent and can ship separately or in parallel.
- `ArtisanHireRequestStatus`'s `CANCELLED` state becomes reachable for the first time — the
  type already declared it (`packages/types/src/artisan.types.ts:113`) but no code path ever
  set it. No type change needed, only the new transition logic.
- `NotificationService` interface grows beyond its current order-only surface
  (`sendOrderPlaced`, `sendOrderStatusChanged`, `sendNewOrderToVendor`) — still log-only
  (`LogNotificationService`), consistent with this project's stated position that no push
  provider exists yet (decision 0042, rule 9, as cited in `log-notification.service.ts`).
- Once `booking_id` exists, any future `artisan_recommendations` / rewards-ledger work (deferred,
  per docs/artisan.md §8–9 and this record's scope) has a real column to build on rather than a
  speculative one — reduces, not increases, future rework.
- Mobile work is unaffected by sequencing here: both batches are backend-only per the user's
  request; wiring the new endpoints into admin UI and into the mobile app are separate,
  follow-on efforts once these endpoints exist.

## Open questions

- Exact wording/shape of the `cancel` endpoint's required `reason` validation (min length? who
  can see it later — log-only like `rejectVerification`, or does the customer-initiated cancel
  need to be customer-visible, unlike the artisan-verification case this pattern is copied
  from?). Default to log-only, matching convention, unless the user says otherwise.
- Whether `COMPLETED` should be settable only by the artisan, or should require the customer to
  confirm completion too (two-sided confirmation) — defaulted here to artisan-only `complete`,
  matching "artisan reports job done" being the simplest version; can be revisited if the client
  wants customer sign-off before a job counts as complete.
- Whether a cancelled-after-`IN_PROGRESS` engagement needs any different handling than
  cancelled-from-`PENDING_ADMIN_REVIEW` (e.g. does partial work get recorded anywhere) — out of
  scope here; current decision treats `CANCELLED` as terminal with no distinction by prior
  state, same as `Order`'s own `CANCELLED` handling treats it as terminal regardless of prior
  state.
- Admin UI and mobile UI for all of the above are explicitly not designed in this record (backend
  only, per user's framing of this request) — need their own pass once these endpoints exist.

## Addendum — 2026-10-30: capacity signal for admin review

Raised during implementation: admin approval of a hire request (the existing
`PENDING_ADMIN_REVIEW` gate — unchanged by this record, still the only path into
`ACCEPTED_BY_ARTISAN`) was approve/reject with no visibility into whether the artisan can
actually take on the work. Admin wants to see, at review time, how many sites/jobs that artisan
is already committed to and how big their team is, before deciding.

**Decision:** `AdminArtisansController`'s hire-request review surface (the pending-review list
and/or the single-request read) gains two derived numbers, computed from data that already
exists — no new table or column:

- **Active jobs** — count of this artisan's *other* hire requests currently in
  `ACCEPTED_BY_ARTISAN` or `IN_PROGRESS` (`HireRequestsService.ACTIVE_ENGAGEMENT_STATUSES`,
  already defined).
- **Team size** — `artisan.team.length` (`ArtisanTeamMember` rows, already loaded via
  `DEFAULT_INCLUDES` in `ArtisansService`).

**"Team members already assigned" is explicitly a proxy, not a new feature**: there is no
concept anywhere in the schema of assigning a specific team member to a specific job
(`ArtisanTeamMember` has no link to `ArtisanHireRequest`). Building that — artisan picks named
crew per job, admin sees exactly who's free — was considered and deliberately deferred; it's a
materially bigger change (new join table, new artisan-side assignment endpoints, new mobile UI)
for a signal admin does not need yet. For now, active-job count stood against team size is the
whole signal: admin reads "3 active jobs, team of 4" and judges capacity from that ratio
themselves. Nothing stops a later record from adding real per-job assignment on top of this
without revisiting the review surface's shape.

This does not change the decision or the batching above — it is scope added to Batch 1, item 4
(the admin hire-request visibility work), not a new batch. Admin remains the sole gate on the
initial `PENDING_ADMIN_REVIEW → ACCEPTED_BY_ARTISAN` transition; `start`/`complete`/`cancel`
remain customer/artisan-initiated as already decided, with admin receiving the same
`sendHireRequestStatusChanged` notification as the non-initiating party for visibility, not as
an approval gate — admin's gating role is scoped to the initial hire, confirmed explicitly in
this addendum rather than left ambiguous.

## Addendum — 2026-10-30: implementation complete (backend)

Both batches are done on `feature/artisan-hire-lifecycle`, test-first throughout (110 backend
tests passing on the affected modules, zero regressions — the only failing suites anywhere in
the backend are pre-existing and environmental: no local MinIO container, and a `razorpay`
type-declaration gap that predates this branch).

**Batch 1 — hire-request lifecycle**, as specified, plus the capacity-signal addendum above:

- `PATCH /artisans/me/hire-requests/:id/start` and `.../complete` (artisan-only, ownership-checked)
- `PATCH /artisans/hire-requests/:id/cancel` (customer, artisan, or admin; reason required)
- `started_at`/`completed_at`/`cancelled_at`/`cancel_reason` columns (migration
  `20261030100000-add-artisan-hire-request-lifecycle-timestamps.js`)
- `GET /admin/artisans/hire-requests` (all statuses, `?status=` filter) — admin's tracking
  surface past the review-only queue
- `NotificationService.sendHireRequestStatusChanged` wired on every transition (review, start,
  complete, cancel) — previously silent
- `artisanActiveJobCount`/`artisanTeamSize` attached to `listPendingAdminReview` only, per the
  capacity-signal addendum — a proxy (active-job count vs. team size), not real per-job
  assignment tracking, as decided there

**Batch 2 — order attribution**:

- Nullable `booking_id` on `orders` → `artisan_hire_requests.id` (migration
  `20261030110000-add-booking-id-to-orders.js`)
- `CheckoutDto.bookingId` (optional) → `CheckoutService.validateBooking()` (exists, owned by the
  caller, in an attributable status: `ACCEPTED_BY_ARTISAN`, `IN_PROGRESS`, or `COMPLETED`) →
  `reconfirmBookingStatus()` re-checks status *inside* the transaction, closing the race window
  between validation (before the cart lock) and commit — added beyond the original spec, per
  user direction, to match this codebase's existing claim-inside-the-transaction discipline
- `OrderDto.bookingId` surfaced on every order read (customer and admin)
- `GET /artisans/hire-requests/:id/orders` — reverse lookup, same ownership rule as the existing
  estimate-history endpoint

**Correctness note worth recording**: `ArtisanHireRequest.customerId` is a `User.id`, while
`Order.customerId` is a `Customer.id` — a different primary key that happens to share a column
name. `validateBooking` compares against the raw `userId`, never against `customer.id`. Flagging
this here since it is exactly the kind of cross-module mismatch that would silently misattribute
every order if assumed rather than verified.

**Module wiring note**: `OrdersModule` and `ArtisansModule` each independently register the
other's model (`ArtisanHireRequest` in `OrdersModule`, `Order` in `ArtisansModule`) via their own
`SequelizeModule.forFeature(...)` calls. Neither imports the other as a Nest `@Module` — confirmed
by direct inspection, not assumed — so there is no circular dependency despite the two-way model
access.

**Testing note**: `CheckoutService.checkout()` had zero pre-existing test coverage and no
cart/order integration fixture exists anywhere in this codebase (confirmed by research before
starting). Rather than build that fixture from scratch — a substantially larger, out-of-scope
lift — the new logic was extracted into small, independently unit-testable methods
(`validateBooking`, `reconfirmBookingStatus`, `listAttributedOrders`), each covered test-first
with mocked models. `checkout()`'s pre-existing ~400-line transaction body itself remains
untested, as it was before this work; that gap is unchanged, not introduced, by this record.

**Not done**: admin UI and mobile UI for any of the above — explicitly out of scope for this
record (backend only, per the user's framing). Rewards ledger and product recommendations
remain out of scope per the original decision.

## Sources

- [docs/artisan.md](../artisan.md) §3–5, §7–9
- `apps/backend/src/modules/artisans/hire-requests.service.ts` (existing `reviewRequest`
  conditional-UPDATE pattern; `ACTIVE_ENGAGEMENT_STATUSES` at line 27)
- `apps/backend/src/modules/artisans/models/artisan-hire-request.model.ts`,
  `apps/backend/database/migrations/20261029090003-create-artisan-hire-requests.js`
- `apps/backend/src/modules/orders/orders.service.ts` (`cancel`, `adminCancel`, `adminRefund`,
  `updateVendorGroupStatus`, `adminOverrideVendorGroupStatus` — conditional-UPDATE and
  transition-table precedents)
- `apps/backend/src/modules/orders/checkout.service.ts`,
  `apps/backend/src/modules/orders/dto/checkout.dto.ts`,
  `apps/backend/src/modules/orders/models/order.model.ts`
- `apps/backend/src/modules/vendors/vendors.controller.ts` (`PATCH
  /vendors/order-groups/:id/status` — the rejected single-PATCH-with-status-body pattern, for
  contrast)
- `apps/backend/src/modules/notifications/notification.interface.ts`,
  `log-notification.service.ts`
- `apps/backend/src/modules/search/search.controller.ts`,
  `packages/types/src/search.types.ts` (product-discovery surface, relevant once a future
  recommendation feature builds on `booking_id`)
- `packages/types/src/artisan.types.ts`
- [0037-phase-2-remaining-work-plan.md](0037-phase-2-remaining-work-plan.md) (format/batching
  precedent)
