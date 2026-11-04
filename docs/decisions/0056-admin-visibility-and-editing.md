# 0056 — Admin visibility, session refresh and editing

- **Date:** 2026-11-04
- **Status:** Accepted (implementing on `feat/admin-visibility`)
- **Supersedes / Superseded by:** Amends the ustaad verification step from the artisan module
  ([artisan.md](../artisan.md)); 0055 contact rules are unchanged for the ustaad's own view.

## Context

The 4 Nov issue triage found four admin and backend problems:

- The admin panel logs out every 15 minutes. The backend issues rotating refresh tokens
  (`POST /auth/refresh`), but `apps/admin/src/services/api/apiClient.ts` clears the tokens on
  any 401 and never calls refresh.
- Approving an ustaad takes two actions on two pages. `users.is_approved` is set on
  `/approvals/artisans`, which the sidebar does not link to. `artisans.is_verified` is set on
  the verification page.
- Admin pages show little contact information. Orders, hire requests, the ustaad directory
  and the vendors page show no phone numbers.
- Ustaad documents can't be opened. The admin sees only the word "Uploaded".

The user then set two broader requirements:

1. Every entity or resource the admin panel shows should show as much information as the
   platform holds.
2. Make a list of what admins should be able to edit.

## Options considered

### Refresh: Option A — in-tab single flight only (what mobile does)

- **Pro:** Same code shape as `apps/mobile/src/api/client.ts`.
- **Con:** A browser can have two admin tabs. Each tab would refresh with the same refresh
  token. The second refresh hits reuse detection and revokes every session.

### Refresh: Option B — in-tab single flight plus a cross-tab Web Lock (chosen)

- **Pro:** Only one tab refreshes. The others find the new token in `localStorage` after the
  lock is released.
- **Con:** `navigator.locks` is missing in old browsers. Those fall back to Option A.

### Visibility: Option A — widen the shared DTOs

- **Con:** Customers, vendors and ustaads would receive admin-only fields such as other
  people's phone numbers.

### Visibility: Option B — admin-only DTOs that extend the shared ones (chosen)

- **Pro:** Non-admin responses don't change. Admin shaping lives in per-module
  `admin-*.mapper.ts` files.
- **Con:** There are more types to keep in step with the shared ones.

## Decision

1. **Admin session.** On a 401 the admin panel refreshes the access token once and retries
   the request. Refreshes are single-flight within a tab and serialised across tabs with
   `navigator.locks` (`'admin-token-refresh'`). If the refresh fails, the admin is logged out.
2. **Ustaad approval is one action (D1, D2).** *Verify* sets `artisans.is_verified = true` and
   `users.is_approved = true` in one transaction. *Reject verification* sets both to false. A
   rejected ustaad is blocked from every `ApprovedGuard` route.
3. **One approval page (D3).** The separate "Ustaad approvals" tab is removed.
   `/approvals/artisans` redirects to `/artisans/verification`.
4. **Maximum information rule.** Quote verbatim: *"Every admin page shows every stored
   field of the record, except the never-render list."* The never-render list:
   - `passwordHash`
   - refresh-token values
   - the `deviceToken` value (shown as "Push: on/off")
   - `identityHash`
5. **Bank account numbers (D4).** Detail popups show the full number. Lists show the last
   four digits.
6. **Documents.** Detail endpoints return short-lived signed links (TTL
   `DOCUMENT_PRESIGN_TTL_SECONDS`). Lists never sign. A stored value that is already an
   `http` URL is returned as is.
7. **Admin writes are logged.** Each write logs one line:
   `admin <adminUserId> <action> <entity> <id> <changed field names>`.
8. **Editable (D5), as proposed:**

| Entity | Editable by admin | Not editable |
|---|---|---|
| User | name, email, phone (unique), deactivate/reactivate, sign out everywhere | role |
| Vendor | shop name, address, lat/lng, GSTIN, UPI, bank account details, min order value, loading team (city, categories and approve/reject already exist) | — |
| Vendor listing | pause / reactivate | price, stock (the vendor owns these) |
| Ustaad | trade, experience, bio, service pincode, available, bank account details, team members (edit, remove) | — |
| Hire request | admin cancel with a reason | reassigning to another ustaad |
| Order | (cancel, refund and group status override already exist) | delivery address |
| Catalog | only the gaps found when the catalog pages are read | — |
| Never | ids, amounts, captured paise, payment events, refunds, timestamps, password | |

Deferred: editing customer name and addresses, and an admin uploading a document for
someone.

## Why

- The admin is the support desk. Every "who is this, how do I call them" question should be
  answerable from the record's popup without a database query.
- Money that has already moved, and history, stay read-only. That keeps refunds,
  reconciliation and audit trustworthy.
- Price and stock are the vendor's commitments, so the admin can pause a listing but not
  rewrite it.

## Consequences

- `@aws-sdk/s3-request-presigner` becomes a backend dependency. It is used for signed
  document read links.
- The admin's `UserDto` responses stop carrying `deviceToken`.
- The dashboard counters "pending ustaads" (`is_approved = false`) and "pending
  verifications" (`is_verified = false`) now move together for ustaads handled after this
  change.
- Plan: [2026-11-04-admin-visibility-and-editing.md](../superpowers/plans/2026-11-04-admin-visibility-and-editing.md).
