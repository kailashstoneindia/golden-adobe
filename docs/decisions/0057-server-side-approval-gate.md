# 0057 — Server-side approval gate for vendors and ustaads

- **Date:** 2026-11-04
- **Status:** Accepted (implementing on `feat/admin-visibility`, Task 4a)
- **Supersedes / Superseded by:** Resolves follow-up F1 of
  [0056](0056-admin-visibility-and-editing.md). Builds on the approval flags of 0048 (vendors)
  and 0056 §2/§3b (ustaads).

## Context

Vendors and ustaads need an admin's approval (`users.is_approved`) before they can do
business on the platform. `ApprovedGuard`
([approved.guard.ts](../../apps/backend/src/common/guards/approved.guard.ts)) was written for
this but no route applied it. Only the mobile app enforced approval, by sending a pending user
to its "pending approval" screen. Any client calling the API directly — or an old app build —
could list products, change stock, update order status or accept jobs while unapproved or
after being rejected. The user ruled on 2026-11-04: "we must have server side check".

## Options considered

### Option A — Opt-in: tag each business route with the guard

- **Pro:** Smallest change per route; easy to read on each handler.
- **Con:** Every route added later must remember the tag. A forgotten tag is a silent hole —
  the failure mode that created F1 in the first place.

### Option B — Locked by default per controller, onboarding routes opt out (chosen)

The guard sits on every controller that vendors or ustaads use. Routes they need *before*
approval are marked `@AllowUnapproved()`.

- **Pro:** A new route is locked unless someone deliberately opens it. A forgotten tag fails
  closed (a 403 an admin or developer will notice), not open.
- **Con:** A new onboarding route must remember to opt out, or onboarding breaks. Mitigated by
  tests that call every onboarding route as a pending user.

### Option C — Global guard (`APP_GUARD`)

- **Con:** Global guards run before the per-controller `JwtAuthGuard`, so the user isn't known
  yet. It would need reordering of all auth, a bigger change than the problem.

## Decision

1. `ApprovedGuard` runs on these controllers, after `JwtAuthGuard` and `RolesGuard`:
   - the ustaad controller (`/artisans`);
   - the vendor controller (`/vendors`);
   - vendor listings (`/vendor/listings`);
   - vendor catalog import (`/vendor/catalog-import`);
   - customer/ustaad orders (`/orders`, `/checkout`).
2. It only judges **vendors and ustaads**. Customers and admins always pass. Approval is read
   from the database on each request, so approving or rejecting takes effect immediately, not
   at the next login.
3. **Open while pending** (marked `@AllowUnapproved()`):

| Who | Routes |
|---|---|
| Ustaad | `POST/GET/PATCH /artisans/me/profile`, `PUT /artisans/me/account-details`, `POST /artisans/me/documents/upload-url`, `POST /artisans/me/documents/confirm`, `POST/PATCH/DELETE /artisans/me/team…`. Browsing (`GET /artisans`, `GET /artisans/:id/public`) is open to any signed-in user. |
| Vendor | `POST /vendors/onboard`, `GET/PATCH /vendors/me`, `PATCH /vendors/me/account-details`, `PATCH /vendors/onboarding-progress`, `GET /vendors/me/categories` |
| Everyone | All `/auth/*` routes and push-token registration (these controllers don't carry the guard) |

4. **Locked until approved:** everything else on those controllers. For an ustaad that's their
   hire requests (list, accept, decline, estimates, start, complete, cancel, linked orders).
   For a vendor it's listings and stock, catalog import/export, and order groups.
5. A locked call answers **403** with `code: "ACCOUNT_NOT_APPROVED"` in the error body, so
   clients can tell it apart from other 403s.

## Why

Approval is a business rule, so the server must enforce it. Client-only checks don't survive
an old app build or a direct API call. Locked-by-default puts the cost of a mistake on the
safe side.

## Consequences

- An ustaad rejected mid-job can't finish it in the app. The admin cancels it (0056 Part C,
  admin cancel).
- The mobile developer must handle `ACCOUNT_NOT_APPROVED` (send the user to the pending
  screen). Normal use shouldn't hit it, because the app already routes pending users there.
- `CatalogModule` and `OrdersModule` import `UsersModule` so the guard can read approval.
- One indexed read of `users` per vendor/ustaad request on these controllers.
