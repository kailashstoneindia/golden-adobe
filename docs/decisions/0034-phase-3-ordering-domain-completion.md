# 0034 — Phase 3 ordering domain: closing the branch out, not just merging it

- **Date:** 2026-10-15
- **Status:** Accepted
- **Supersedes / Superseded by:** —

## Context

`worktree-phase-3-ordering-domain` (branch `worktree-phase-3-ordering-domain`, HEAD `c64289c`)
implements the Phase 3 scope from the signed proposal — Cart Management, Checkout Flow,
Razorpay Integration, Order Management, Notifications — against decisions filed on that branch
as its own `0032`/`0033`-equivalent records at the time this was written (note: branch-local
`0032`/`0033` were cart-ownership and cart-structure records, a different pair from the
AWS-cost/media records that occupy those numbers on `main` — the branch's own 0033 already
flagged this numbering divergence; **those branch-local records have since been renumbered to
0035/0036 on that branch** — see this record's own Open Questions update and 0035/README's
numbering notes on this branch for the full account). The nine feature commits plus a final
whole-branch review
pass (`c64289c`, fixing 6 of 8 findings plus one bug caught while verifying a fix) are
complete, typecheck-clean, and the branch's own unit tests pass.

Two things are true at once and this record is about not losing either of them:

1. **The code is done to the standard this project's review process requires.** It is not a
   draft and does not need another round of feature-building to be "finished" in the
   engineering sense.
2. **"Phase 3 complete" is not the same claim as "merged and operable."** Three categories of
   work remain before this can be called closed: getting the branch into `main`, giving admin
   the minimum API surface needed to operate what this branch built, and a short list of
   product/ops decisions that only the client can make — none of which are coded yet because
   they are not engineering decisions.

This record exists so "Phase 3" is not marked done on the strength of the branch alone, and so
the admin-API gap (surfaced while reviewing this branch, not planned for in the original
decision records) is tracked as real scope rather than assumed into Phase 4's UI work.

## What already exists (no further design needed)

- `customers`, `customer_addresses`, `cart`, `cart_item`, `orders`, `order_vendor_group`,
  `order_items` — seven tables, migrated.
- Cart add/update/remove API, scoped to a resolved `customer.id`.
- Checkout: single transaction, cart-row-locked, all-or-nothing validation, stock reservation,
  price snapshot, Razorpay order creation moved outside the reservation transaction with its
  own timeout and compensating release.
- Razorpay webhook: capture confirms and decrements; failure leaves the order payable for retry
  (not cancelled) per the review's fix #1; idempotent against replay via `UPDATE ... WHERE
status = 'pending_payment'`.
- Customer read/cancel, vendor list/status (gated to confirmed-or-later orders), admin
  list/get — all built.
- `PaymentProviderService` / `NotificationService` interfaces with Razorpay and log
  implementations, unit-tested against mocks.
- `inStock` derivation unified across indexing and both Postgres-fallback paths.

None of this needs re-litigating. The options-considered analysis lives in the branch's own
0032/0033-equivalent records; this record does not repeat it.

## Options considered

### Question 1 — how to treat the admin-API gap found during review

#### Option A — Fold it into Phase 4 (admin panel UI phase)

- **Pro:** Matches the original plan's phase boundary — `implementation_plan.md` puts all
  admin panel work, UI and API alike, in Phase 4.
- **Con:** Phase 4's admin API was scoped for catalog/user administration
  (`admin.controller.ts`: stats, user list, approve/reject). It was never scoped against an
  ordering domain that didn't exist yet when that plan was written. Deferring the gap wholesale
  risks it being silently absorbed into "UI work" and never separately estimated.

#### Option B — Scope and build the minimum admin API now, as Phase 3 work

- **Pro:** The gap exists _because_ Phase 3 shipped a payment/reservation system with no manual
  override path. `admin/orders` today is read-only (`list`, `get` — see
  `apps/backend/src/modules/orders/admin-orders.controller.ts`). Without a cancel/refund/audit
  path, the only way to unstick a stuck reservation or process a refund is direct database or
  Razorpay-dashboard access — which this project's own constraints already rule out as a
  practice (Railway "prod" access is DB-only, no dashboard, by design).
- **Con:** Expands what "Phase 3" means versus the signed proposal's literal wording.

### Question 2 — whether to merge before or after the admin-API gap is closed

#### Option A — Merge now, build admin API as a fast-follow

- **Pro:** `main` gets the ordering domain sooner; nothing blocks catalog/search work that
  depends on `main` staying current.
- **Con:** A merged "Phase 3 done" branch with no way to cancel a stuck order or issue a refund
  is operationally incomplete the moment the first real customer transaction happens.

#### Option B — Close the admin-API gap first, merge once

- **Pro:** One merge, fully operable from day one.
- **Con:** Delays `main` getting cart/checkout/orders at all, blocking anything downstream that
  wants to build against it.

## Decision

**Option B on Question 1, Option A on Question 2.**

> **1. The admin-API gap is Phase 3 scope, not deferred to Phase 4.** Phase 4 remains the admin
> _UI_. The backend endpoints an admin needs to operate the ordering domain — cancel, refund
> trigger, payment-event audit view, vendor-group status override — are built now, against
> `admin/orders`, with no UI attached. This matches the user's own framing: "we will build
> backend api required for phase 3 in phase 3. We can refine admin later, in phase 4."
>
> **2. The branch merges to `main` first; the admin-API gap is closed as an immediate
> fast-follow PR, not a precondition for merging.** The ordering domain is valuable to have on
> `main` even before admin tooling exists, and nothing in the admin-API work touches the
> checkout/webhook code path that was just reviewed — it is additive, so splitting it into a
> second PR does not reopen anything already settled.
>
> **3. The client-decision list (cancellation policy, cart TTL, reservation-sweep timeout,
> vendor-pause-mid-checkout behaviour, paint/custom-order MVP inclusion, Razorpay/Firebase
> credential ownership, multi-vendor order reference display) is tracked here as a blocking
> dependency for specific pieces of code, not for the merge itself.** The merge does not wait
> on these answers. Each answer unblocks one specific follow-up:
>
> | Decision                               | Blocks                                                                                                                                |
> | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
> | Cancellation policy (who, until when)  | Admin cancel endpoint's authorization rule; customer-facing cancel window                                                             |
> | Cart TTL                               | A cart-expiry job (not yet built, not yet scoped as code)                                                                             |
> | Reservation-sweep timeout              | The sweep job that releases abandoned `pending_payment` reservations (0032-equivalent open question, still open)                      |
> | Vendor-pause-mid-checkout              | Whether checkout validation gets a new rejection rule                                                                                 |
> | Paint/custom-order MVP inclusion       | Whether the current checkout rejection for `tinted_to_order` lines is final or needs real support before launch                       |
> | Razorpay/Firebase credential ownership | When live payment capture / push notifications can be verified end-to-end, as opposed to against mocks                                |
> | Multi-vendor order reference display   | Whether `order_vendor_group` needs a customer-visible identifier (open question already named in the branch's 0033-equivalent record) |

## Why

**On rule 1.** The admin-API gap was not a known unknown when the original implementation plan
was written — that plan predates the ordering domain existing at all, so it could not have
scoped admin actions against tables that did not exist. Discovering it during this branch's
review is new information, not a missed requirement, and the right response to new information
discovered mid-phase is to scope it into the phase that surfaced it, not to silently fold it
into a later phase's UI estimate where it will be underweighted.

**On rule 2.** Splitting the merge from the admin-API work follows the same reasoning 0033 used
for payments/notifications: build the dependency-bearing piece first, let the dependent piece
follow as a non-blocking fast-follow. The checkout/webhook code is independently reviewed and
stable; admin tooling for it is additive and carries no risk of destabilizing what was just
verified live against Postgres.

**On rule 3.** Several of these decisions gate code that has not been designed yet (the sweep
job, a cart-expiry job) — writing that code before the client answers would mean guessing at
parameters (a TTL, a timeout) that are product decisions, not technical ones, and re-doing the
work if the guess is wrong. Decisions that gate _existing_ code paths (cancellation policy
gating the cancel endpoint's auth rule) are listed so the admin-API build in rule 1 is not
accidentally finished with a guessed-at policy baked in.

## Consequences

- **Two PRs, not one.** PR 1: merge `worktree-phase-3-ordering-domain` to `main` as-is (possibly
  after a rebase if `main` has moved — `main` currently has `0031`/`0032`/`0033` as AWS-cost
  records, which the branch's cart/order `0032`/`0033`-equivalent records will need renumbering
  around when ported, following the same renumbering this branch's own 0033 already did once).
  PR 2: admin-API endpoints (cancel, refund trigger, payment-event audit, vendor-group status
  override), built against `main` post-merge.
- **The reservation-sweep job and cart-TTL job are explicitly not in either PR.** They need
  client-supplied parameters first. Building them with placeholder values risks shipping a
  sweep that silently does the wrong thing — worse than not having one, which at least fails
  visibly (per the same reasoning 0032-equivalent's own "Why" section used for reserve-at-
  checkout over reserve-at-add).
- **The client questionnaire (see conversation; not yet a doc artifact) is an external
  dependency for exactly the items in rule 3's table**, and should be sent before PR 2's
  authorization-rule pieces (cancel, override) are finalized, even though PR 2's read-only
  pieces (audit view) can proceed without waiting.
- **No new payment or notification credentials are acquired by this plan.** That remains
  explicitly the client's decision (branch's 0033-equivalent rule 8/9 and this record's
  question list), named again here so it is not silently assumed to be in progress a second
  time.

## Open questions

- **Exact shape of the refund endpoint.** Full refund only, or partial per-line? Not arguable
  without knowing Razorpay's refund API constraints against this schema's per-vendor-group
  totals — deferred to the PR 2 implementation step, not blocking this record.
- **Whether the vendor-group status override needs its own audit trail** (who overrode what,
  when) — likely yes, given the payment lifecycle's existing emphasis on auditability, but not
  settled here.
- **Renumbering collision — resolved 2026-10-19, confirmed as predicted.** This record is filed
  as `0034` on `main`. Checked directly against the worktree's own `docs/decisions/` listing: its
  cart/order records already landed at `0035` (`cart-owner-reservation-and-real-instock.md`) and
  `0036` (`cart-and-order-structure.md`) — exactly the numbers this note anticipated, not
  `0032`/`0033`. This record's own body text above still says "0032/0033-equivalent" throughout,
  written before that resolution; read every such reference as meaning the worktree's 0035/0036.
  Whoever performs the merge still needs to check `README.md`'s index at merge time for whatever
  else has landed on `main` by then (this branch alone added `0031`, `0034` itself, and
  `0035`–`0037` for an unrelated client-feedback workstream — see those records), since more
  numbers may be taken by the time this actually merges.
