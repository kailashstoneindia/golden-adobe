# 0055 — Ustaad accept/decline step after the admin gate

- **Date:** 2026-11-04
- **Status:** Implemented on `feat/artisan-accept-decline` (backend + admin tracking page; mobile not started)
- **Supersedes / Superseded by:** Amends [0045](0045-artisan-hire-lifecycle-and-order-attribution.md)
  (admin approval no longer lands on `ACCEPTED_BY_ARTISAN`)

## Context

In the hire flow as built (0045), the admin approving a request moved it straight from
`PENDING_ADMIN_REVIEW` to `ACCEPTED_BY_ARTISAN`
([hire-requests.service.ts](../../apps/backend/src/modules/artisans/hire-requests.service.ts),
`reviewRequest`). The ustaad was never asked. They could only cancel.

That is not what the admin step was for. The user clarified the intent: the admin is a
**gate**, not a stand-in for the ustaad. An ustaad may say yes to a job they don't have the
bandwidth to finish, or there may be other reasons to stop a request, so the admin decides
whether a request reaches the ustaad at all. Once the admin allows it, the ustaad decides
whether to take it.

The user also wants the ustaad to see the customer's contact details once the request
reaches them, so they can talk before accepting.

Scope is MVP: keep the flow minimal.

## Options considered

### Option A — Admin allows, then the ustaad accepts or declines (new waiting status)

- **Pro:** Matches the stated intent exactly. The admin keeps the gate. The ustaad's yes is
  real.
- **Con:** Two more statuses, two endpoints and an expiry job.

### Option B — Keep admin approval as acceptance, let the ustaad cancel

- **Pro:** No change.
- **Con:** It's what exists, and it's the misunderstanding: the request says "accepted by
  artisan" when the ustaad never accepted it, and a decline shows up as a cancellation.

### Option C — Drop the admin gate, ustaad responds directly

- **Pro:** Simplest flow.
- **Con:** Removes the gate the user explicitly wants (capacity and other reasons).

## Decision

> **Option A.**
>
> 1. **New statuses:** `PENDING_ARTISAN_RESPONSE` (allowed by admin, waiting on the ustaad),
>    `ARTISAN_DECLINED` and `EXPIRED` (both terminal).
> 2. **Admin allow** moves `PENDING_ADMIN_REVIEW → PENDING_ARTISAN_RESPONSE`. Admin block is
>    unchanged (`ADMIN_REJECTED`, terminal).
> 3. **Ustaad responds** with `PATCH /artisans/me/hire-requests/:id/accept` →
>    `ACCEPTED_BY_ARTISAN`, or `PATCH /artisans/me/hire-requests/:id/decline` (reason
>    required) → `ARTISAN_DECLINED`. Owning ustaad only.
> 4. **2-day window:** the ustaad has 48 hours from the admin allowing the request
>    (`admin_reviewed_at`). Time spent waiting on the admin does not count. After that,
>    accept and decline both answer 409, even before the sweep has run.
> 5. **Expiry sweep:** a `@Cron` job every 15 minutes moves `PENDING_ARTISAN_RESPONSE` rows
>    past the window to `EXPIRED` in one guarded UPDATE. It skips on API-only worker mode,
>    same as the stale-reservation sweep (0049).
> 6. **Customer contact:** hire-request reads carry `customerName` and `customerPhone` only
>    while the status is `PENDING_ARTISAN_RESPONSE`, `ACCEPTED_BY_ARTISAN` or `IN_PROGRESS`.
>    They are `null` in every other status, so they disappear on decline, expiry, block,
>    cancellation and completion.
> 7. **One open request per customer–ustaad pair:** a customer may hold open requests with
>    any number of ustaads at once, but not two with the same ustaad. "Open" is
>    `PENDING_ADMIN_REVIEW`, `PENDING_ARTISAN_RESPONSE`, `ACCEPTED_BY_ARTISAN` or
>    `IN_PROGRESS`. Once that request ends, the customer may ask the same ustaad again.
>    Enforced by a check in `createRequest` (409) **and** a partial unique index, so two
>    concurrent requests can't both get through.
> 8. **Ustaad visibility:** the ustaad never sees `PENDING_ADMIN_REVIEW` or `ADMIN_REJECTED`
>    requests. A blocked request was never sent to them.
> 9. **Cancel:** the customer or admin may cancel while the request waits on the ustaad. The
>    ustaad cannot cancel at that point; they decline instead (409 points them there).
> 10. **Unchanged:** estimates, start, complete, and checkout `bookingId` attribution all
>     still require the ustaad to have accepted. Capacity signal (active jobs) still counts
>     `ACCEPTED_BY_ARTISAN` + `IN_PROGRESS` only.

## Why

The admin step exists to protect the customer from an ustaad who would say yes without the
capacity to deliver. Making admin approval *be* the acceptance turned a safety gate into a
forced assignment. Option A keeps both decisions with the person who owns them.

Calls made by Claude, not the user, in keeping the flow minimal:

- `EXPIRED` is a separate status from `ARTISAN_DECLINED`, so the admin can tell "said no"
  from "never answered".
- The 48-hour window is derived from `admin_reviewed_at`, not stored as its own column. The
  DTO exposes it as `artisanResponseDueAt` for the app to show a countdown.
- New columns are only `artisan_responded_at` and `artisan_decline_reason`. An expired
  request's time of expiry is its `updated_at`.
- Contact details are name and phone. The site address was already on the request.

## Consequences

- Rows already in `ACCEPTED_BY_ARTISAN` from before this change stay there. They were
  approved under the old meaning, and moving them back to waiting would surprise the ustaad
  who's already working them.
- The partial unique index will fail to build if prod already holds two open requests for
  the same customer–ustaad pair. Check before deploying the migration.
- Adding Postgres enum values cannot be undone cleanly. The migration's `down` drops the
  columns and index but leaves the enum values in place (harmless when unused).
- Notifications are still log-only (0052): accept and decline notify the customer, expiry
  notifies both.
- The admin tracking page needs labels for the three new statuses.

## Open questions

Deliberately out of MVP scope:

- Ustaad-quoted price or labour charges. There is still no price on a hire request.
- Admin reassigning a declined or expired request to a different ustaad. The customer sends
  a new request instead.
- Real push notifications.
- Mobile screens for any of this.

## Sources

- Conversation with the user, 2026-11-04.
