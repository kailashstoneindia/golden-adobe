# 0049 — Stale reservation sweep: releasing abandoned-checkout stock holds

- **Date:** 2026-10-31
- **Status:** Implemented (`27e6784`)
- **Supersedes / Superseded by:** —

## Context

[0041](0041-cart-owner-reservation-and-real-instock.md) reserves stock (`quantity_reserved`) when
checkout begins, not when an item is added to a cart. That reservation is released on explicit
cancellation (`OrdersService.cancel`,
[orders.service.ts:63-155](../../apps/backend/src/modules/orders/orders.service.ts#L63)) and on
payment confirmation (the Razorpay webhook's success path). It is **not** released on
`payment.failed` — deliberately, since a failed attempt (e.g. a wrong UPI PIN) is expected to be
retried on the same order, confirmed at
[webhooks.controller.ts:94-113](../../apps/backend/src/modules/orders/webhooks.controller.ts#L94).

0041's own "Open questions" names the resulting gap directly: **if a customer reaches the
Razorpay payment sheet and abandons it — closes the tab, loses signal, simply never finishes —
Razorpay sends no webhook at all for that case.** No code path in this repo ever touches that
order again. It sits in `PENDING_PAYMENT` forever, and the stock it reserved is unavailable to
every other customer forever, with nothing to notice or fix it short of an admin finding it by
hand. 0041 flagged the gap but left the timeout, the mechanism, and whether to notify the
customer undecided. This record settles all three.

## Options considered

### Mechanism

#### Option A — `@nestjs/schedule` `@Cron` job on `OrdersService`

- **Pro:** In-process, no new infrastructure. The release logic already exists and is already
  safe under concurrent execution — `cancel`'s guarded `UPDATE orders SET status = 'cancelled'
WHERE id = :id AND status = 'pending_payment'`
  ([orders.service.ts:90-101](../../apps/backend/src/modules/orders/orders.service.ts#L90)) means
  two processes sweeping the same stale order at once is harmless: the second one's UPDATE
  affects zero rows and does nothing further. No lock is needed for correctness, unlike the
  search-outbox drain below.
- **Con:** A new dependency (`@nestjs/schedule` is not currently installed — confirmed via
  `package.json`), and `@Cron` fires independently in every running process unless gated.

#### Option B — A BullMQ repeatable job, matching the search-outbox drain's existing pattern

- **Pro:** Matches an already-proven pattern in this exact codebase
  ([indexing.processor.ts](../../apps/backend/src/modules/search/indexing/indexing.processor.ts))
  — retry with exponential backoff, and a shape that survives being split into its own
  Railway service later via `WORKER_MODE`.
- **Con:** That pattern's weight is there for a reason the sweep doesn't share: the outbox drain
  needs an advisory lock (`OutboxPoller`'s `search_outbox_try_lock()`) because **without one,
  two concurrent drains could double-process the same batch** — no such hazard exists here, since
  the sweep's own guarded UPDATE is self-serializing. Adopting the heavier pattern for a job that
  doesn't need its guarantees is the kind of unjustified complexity this project avoids
  elsewhere (see 0046's rejection of an append-only recommendation log for the same reason —
  matching a precedent's _shape_ without needing its _reason_ is not reuse, it's cargo-culting).

#### Option C — Redis TTL keys with expiry events

- **Pro:** Push-driven — the release fires the instant the TTL expires, not on the next poll.
- **Con:** Introduces a second source of truth for an order's age (a Redis key's TTL vs. the
  `orders.created_at` column that already exists and is already indexed-adjacent via the primary
  key lookup) for a job where a 20-minute timeout swept every 5 minutes has no perceptible lag.
  Also needs a listener process for Redis keyspace-notification events, which is more moving
  parts than a `WHERE created_at < now() - interval` query.

**Decision: Option A.** `@nestjs/schedule`'s `@Cron`, gated by the same `WORKER_MODE !== 'api'`
check the search indexing module already uses, for consistency with this project's existing
deploy model — not because correctness requires it, but because every other background job in
this codebase respects that flag, and a sweep silently running inside an `api`-only process would
violate an invariant everyone else maintains.

### Release logic

**Decision: extract `cancel`'s existing transaction body, don't write new release logic.**
`OrdersService.cancel`'s transaction
([orders.service.ts:82-143](../../apps/backend/src/modules/orders/orders.service.ts#L82)) already
does exactly the right thing: guarded status UPDATE, per-item `quantity_reserved` decrement, and
`OrderVendorGroup` cancellation. This is pulled into a private `releaseAndCancel(orderId,
customerId)` method; both the customer-triggered `cancel` and the new sweep call it. No new SQL.

### Timeout

**Decision: 20 minutes, swept every 5 minutes.** Typical checkout-hold windows across comparable
platforms run 5–15 minutes; 20 is chosen slightly above that floor specifically because
`payment.failed`'s own handling already treats a UPI-retry-after-wrong-PIN as the _expected_ case
for this exact checkout, not an edge case — a customer retrying across one or two failed
attempts needs more headroom than a single-swipe card checkout does. Both numbers are named
constants (`STALE_RESERVATION_TIMEOUT_MS`, `SWEEP_INTERVAL_MS`) in the sweep's own file, not
buried in the cron expression, so they're easy to tune without re-deriving the cron string.

### Customer notification

**Decision: yes — `NotificationService.sendOrderStatusChanged(customerId, orderId,
OrderStatus.CANCELLED)`.** This already exists
([notification.interface.ts](../../apps/backend/src/modules/notifications/notification.interface.ts))
and already fires from `cancel`'s customer-initiated path
([orders.service.ts:153](../../apps/backend/src/modules/orders/orders.service.ts#L153)) — a
system-initiated cancellation is still "this order's status changed" from the customer's point of
view, so the sweep calls the identical method. No interface change.

**Correction to this record's own earlier research:** a prior pass (research step before this
record) mis-read `cancel` as never calling `sendOrderStatusChanged` and flagged it as a possible
separate gap. Re-confirmed directly against
[orders.service.ts:153](../../apps/backend/src/modules/orders/orders.service.ts#L153) — it does.
No such gap exists; not tracked further here.

## Decision

> 1. Add `@nestjs/schedule` to `apps/backend/package.json`; register `ScheduleModule.forRoot()`
>    once in `AppModule` ([app.module.ts](../../apps/backend/src/app.module.ts)).
> 2. Extract `OrdersService.cancel`'s transaction body
>    ([orders.service.ts:82-143](../../apps/backend/src/modules/orders/orders.service.ts#L82))
>    into a private `releaseAndCancel(orderId: string): Promise<boolean>` — same guarded UPDATE,
>    same inventory release, same `OrderVendorGroup` cancellation, returns whether it actually
>    cancelled (for the caller to decide whether to notify/no-op). `cancel` keeps its own
>    customer-ownership check and 404/400 handling around the call; it does not change behavior.
> 3. Add a sweep method to `OrdersService` (or a small co-located `order-sweep.service.ts` if
>    `orders.service.ts` is judged too large to grow further — implementer's call, not designed
>    here): `@Cron(CronExpression.EVERY_5_MINUTES)`, gated on `workerMode !== 'api'` exactly as
>    `IndexingProcessor.onModuleInit` gates the outbox drain
>    ([indexing.processor.ts:54-61](../../apps/backend/src/modules/search/indexing/indexing.processor.ts#L54)).
>    Finds `Order` rows where `status = PENDING_PAYMENT AND created_at < now() -
STALE_RESERVATION_TIMEOUT_MS`, calls `releaseAndCancel` for each, and on a true result calls
>    `sendOrderStatusChanged(customerId, orderId, OrderStatus.CANCELLED)` — same call `cancel`
>    already makes, same reasoning.
> 4. `STALE_RESERVATION_TIMEOUT_MS = 20 * 60 * 1000`, `SWEEP_INTERVAL` via
>    `CronExpression.EVERY_5_MINUTES`, both named constants at the top of the sweep's own file.

## Why

Option A over Option B is the load-bearing choice in this record: this project has an existing,
proven "scheduled background job" pattern (BullMQ), and deliberately not reusing it here is a
call worth defending explicitly rather than silently diverging. The outbox drain's weight (lock,
retry/backoff, `WORKER_MODE` service-split readiness) exists because _without_ those guarantees,
concurrent drains corrupt state (double-processing the same outbox batch) — the sweep has no
equivalent failure mode, because its own guarded UPDATE already makes concurrent execution a
no-op rather than a hazard. Matching Option B's shape without needing its reason would be
complexity for its own sake, which is exactly what 0046 argued against when it rejected an
append-only log for recommendations that have no append-only requirement.

## Consequences

- One new dependency (`@nestjs/schedule`), one new `AppModule` registration, one extracted
  method, one new cron method, two named constants — small enough for one PR.
- `cancel`'s customer-facing behavior is unchanged; the extraction is a refactor, not a behavior
  change, and should ship with the existing `cancel` tests still green as proof of that.
- Every order abandoned mid-checkout now self-heals within at most ~25 minutes (20-minute
  timeout plus up to one 5-minute sweep interval) instead of holding stock forever. This closes
  the live risk 0041 flagged as "not yet reachable" and the subsequent branch review confirmed
  was real.
- `WORKER_MODE=api` deployments do not run the sweep, matching how they already don't run the
  search-outbox drain — some other process in that topology is expected to own it, same as today.

## Open questions

- Whether a `PENDING_PAYMENT` order that already received at least one `payment.failed` webhook
  should get a _shorter_ sweep timeout than one that never got a webhook at all (the former has
  stronger evidence the customer tried and struggled; the latter could still be mid-flow on a
  slow connection). Not designed here — a single fixed timeout is simpler and sufficient to
  close the gap; a differentiated timeout can be layered on later without revisiting this
  record's mechanism.
- Whether sweep-cancellations should be distinguishable from customer-initiated or
  payment-failure cancellations in whatever admin order view exists, for support/debugging
  purposes (e.g. "why did this order cancel itself?"). Not designed here; `OrderStatus` has no
  room for a cancellation-reason today and adding one is a larger schema question than this
  record's scope.
- Whether multi-instance deployments ever need the sweep to run on more than one process
  simultaneously for throughput (e.g. a very large pending-order backlog). Not a concern at
  current scale; flagged only so a future reader doesn't assume it was overlooked.

## Sources

- [0041-cart-owner-reservation-and-real-instock.md](0041-cart-owner-reservation-and-real-instock.md)
  (the open question this record resolves)
- [0042-cart-and-order-structure.md](0042-cart-and-order-structure.md) (order/cart structure,
  `OrderVendorGroup`)
- `apps/backend/src/modules/orders/orders.service.ts` (`cancel`'s existing release logic, to be
  extracted and reused)
- `apps/backend/src/modules/orders/webhooks.controller.ts` (`payment.failed`'s deliberate
  non-release, the UPI-retry reasoning behind the 20-minute timeout)
- `apps/backend/src/modules/orders/models/order.model.ts` (`OrderStatus` enum)
- `apps/backend/src/modules/search/indexing/indexing.processor.ts` (the existing BullMQ pattern,
  compared against and not reused, with the reasoning named)
- `apps/backend/src/modules/notifications/notification.interface.ts`
  (`sendOrderStatusChanged`, reused as-is)
- `apps/backend/src/config/configuration.ts` (`workerMode` / `WORKER_MODE` env var)
- [0046-artisan-product-recommendations.md](0046-artisan-product-recommendations.md) (the
  precedent for rejecting a heavier pattern that doesn't match the actual requirement)
