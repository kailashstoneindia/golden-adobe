# 0039 — Last-login timestamp on users

- **Date:** 2026-10-20
- **Status:** Accepted
- **Supersedes / Superseded by:** —

## Context

Client request (2026-10-18, [0035](0035-client-feedback-triage-2026-10-18.md) #3): show a
last-login timestamp on the admin "All Users" screen. Approved for incremental delivery under
[0038](0038-admin-panel-incremental-delivery.md) rule 3 — a new nullable column plus writing it
at existing authentication points, no new domain concept.

`AuthService` (`apps/backend/src/modules/auth/auth.service.ts`) has five call sites for the
shared `generateTokenPair(user)` helper (line 360), which is the one place every successful
authentication currently touches the database (it writes a `refresh_token` row). But
`generateTokenPair` is **also** called from `refresh()` (line 323) on every silent token
refresh — not a real login. Writing `last_login_at` inside the shared helper would bump it on
every background token rotation, which would make "last login" mean "last time the app was
open," not what the client asked for.

## Options considered

### Option A — Write last_login_at inside generateTokenPair

- **Pro:** One call site, can't be missed if a new login path is added later.
- **Con:** Also fires on `refresh()`, silently redefining "last login" to "last token refresh."
  Wrong per the client's own framing ("last login").

### Option B — Write it explicitly at each real-authentication call site

- **Pro:** Correct semantics — only fires on `verifyOtp` (existing user), `register` (new user,
  first login), `registerAdmin` (admin signup), `loginAdmin` (admin login). `refresh()` is
  excluded by construction, not by a conditional.
- **Con:** Four call sites instead of one — a future fifth login path (if ever added) needs to
  remember to write it too, same as it already needs to remember to call `generateTokenPair`.

## Decision

> **Option B.** Add nullable `users.last_login_at` (TIMESTAMPTZ). Write it at the four real-auth
> call sites in `AuthService` — `verifyOtp`'s existing-user branch, `register`, `registerAdmin`,
> `loginAdmin` — immediately before or alongside the `generateTokenPair` call, not inside it.
> `refresh()` is deliberately left untouched.
>
> Exposed on the admin Users list/detail read path and the admin Users table UI as a formatted
> timestamp, "Never" (or equivalent) when null — every existing user predates this column and
> has no historical value to backfill.

## Why

"Last login" has one correct meaning to a non-technical reader of the admin panel: when did
this person last actually sign in. Token refresh is invisible infrastructure the client never
asked about and would not expect to move this number. Getting this distinction right now costs
four lines instead of one; getting it wrong would need to be noticed (probably by the client,
after rollout) and fixed later with the same four-line change anyway.

## Consequences

- Nullable column, no backfill — existing users show "Never" until they next authenticate.
  Same pattern this project already uses for additive nullable columns (`vendors.city_source`,
  `vendors.has_loading_unloading_team`).
- No change to `refresh()` or the shared token-pair helper — zero risk to existing login/refresh
  behavior.

## Open questions

- None.
