# 0050 — Admin password reset

- **Date:** 2026-10-31
- **Status:** Implemented (`0dde8ba`)
- **Supersedes / Superseded by:** —

## Context

The deep-dive research into the `auth` module (this session, prior to this record) found no
password-recovery path for admin accounts: `loginAdmin`
([auth.service.ts:246-271](../../apps/backend/src/modules/auth/auth.service.ts#L246)) has no
rate limiting or lockout, and if an admin forgets their password, the only existing path forward
is `registerAdmin` — which fails outright on an email that already has an account
(`ConflictException`, [auth.service.ts:224-226](../../apps/backend/src/modules/auth/auth.service.ts#L224)).
There is no way to recover a forgotten admin password today short of a direct database edit.

Admin accounts in this codebase are created via a **shared secret**
(`ADMIN_REGISTRATION_SECRET`, timing-safe compared in
`assertValidAdminRegistrationSecret`,
[auth.service.ts:273-289](../../apps/backend/src/modules/auth/auth.service.ts#L273)), not by
invitation from another admin — anyone holding that secret can register as a new admin. No email
or SMS delivery mechanism exists for admins: customer/vendor/artisan auth uses MSG91 OTP, but
admin auth is email+password only, and no email provider (SES/SendGrid/etc.) is wired anywhere
in this codebase (confirmed by a repo-wide dependency check — none present). A conventional
"email a reset link" flow is therefore not a drop-in option without first standing up email
infrastructure this project does not otherwise need yet.

## Options considered

### Reset mechanism

#### Option A — Reuse `ADMIN_REGISTRATION_SECRET` as the reset authorization

- **Pro:** Zero new infrastructure. The secret already functions as "proof you're allowed to
  control who has admin access" — registering a new admin and resetting an existing admin's
  password are the same trust decision (who may act as an admin), so reusing the same gate is
  consistent with the trust model already in place, not a new one invented for this record. Works
  immediately, in every environment, with no delivery dependency.
- **Con:** Whoever holds the secret can reset *any* admin's password without that admin's
  involvement or consent — there is no "prove you own this email" step, unlike a typical
  emailed-link reset. Acceptable here because the secret already grants the equivalent power
  (create a brand new admin account outright), so this adds no capability beyond what already
  exists; it only extends an existing capability to an existing account instead of only a new one.

#### Option B — Wire a real email provider, build a token-based "email me a reset link" flow

- **Pro:** The conventional, user-isolated pattern — only the account owner (assuming their inbox
  is secure) can trigger and complete their own reset.
- **Con:** Requires standing up an email provider and its credentials (an entire new piece of
  infrastructure, mirroring the exact kind of setup cost the MSG91/OTP integration earlier this
  session took multiple sessions to sort out) for a feature serving a small, known set of admin
  accounts. Confirmed with the user before designing: out of scope for this record: the user
  explicitly chose Option A over standing up email first.

**Decision: Option A.**

## Decision

> 1. **New endpoint**: `POST /auth/admin/reset-password` on `AuthController`
>    ([auth.controller.ts](../../apps/backend/src/modules/auth/auth.controller.ts)), alongside
>    the existing `admin/register` and `admin/login` routes.
> 2. **New DTO**: `AdminResetPasswordDto` — `{ email: string; newPassword: string; secretKey:
>    string }`, same validation shape as `AdminRegisterDto`/`AdminLoginDto` (`@IsEmail()`,
>    password `@MinLength(8) @MaxLength(128)`, `secretKey` `@MinLength(8)`).
> 3. **New service method** `AuthService.resetAdminPassword(dto)`:
>    - Validates `secretKey` via the existing `assertValidAdminRegistrationSecret` — no new
>      secret-checking logic, the exact same method `registerAdmin` already calls.
>    - Looks up the user by normalized (trimmed, lowercased) email; 404s via
>      `NotFoundException` if no such admin exists (matches `registerAdmin`'s own "does this
>      email already belong to someone" check being the mirror-image condition).
>    - Rejects (400) if the found user's `role !== Role.ADMIN` — this endpoint resets admin
>      passwords only, not an arbitrary account-takeover path for any role.
>    - Hashes `newPassword` with `bcrypt.hash` at `BCRYPT_SALT_ROUNDS`, same as `registerAdmin`,
>      and updates `passwordHash` on the user row.
>    - **Revokes every existing refresh token for that user** —
>      `refreshTokenModel.update({ isRevoked: true }, { where: { userId } })`, the exact pattern
>      already used for reuse-detection in `refresh()`
>      ([auth.service.ts:311-314](../../apps/backend/src/modules/auth/auth.service.ts#L311)). A
>      password reset that leaves old sessions alive defeats the point of resetting it — if the
>      password was forgotten/compromised, any session issued under the old password should not
>      silently persist.
>    - Logs the reset (admin email, no password/secret in the log line) and returns `{ success:
>      true }` — no tokens issued; the admin logs in again via the normal `admin/login` flow
>      with their new password, matching how a reset conventionally ends in "now log in," not an
>      automatic session.
> 4. **No admin UI change in this record.** The admin app's `RegisterPage`/`LoginPage` are not
>    touched — this ships as an API-only capability for now (callable via curl/Swagger by whoever
>    holds the secret), matching how MSG91 configuration and other operational tasks in this
>    project are handled directly rather than through a UI. A "Forgot password?" UI affordance is
>    a follow-on, not designed here.

## Why

Reusing `assertValidAdminRegistrationSecret` rather than writing new secret-validation logic
keeps exactly one timing-safe-compare implementation in this module — a second, subtly different
copy is how a future reader ends up trusting the wrong one. Revoking all refresh tokens on reset
mirrors the project's own existing reuse-detection reasoning in `refresh()`: a credential change
(forced revocation there, a password reset here) should not leave old sessions standing, and this
record does not invent a new policy for that, it applies the one already decided.

Scoping out UI (item 4) matches this record's framing as a backend-only operational capability —
the same framing 0045 and 0046 used for artisan backend work, where UI was explicitly named as
follow-on rather than designed inline.

## Consequences

- One new route, one new DTO, one new service method — small enough for one PR.
- `ADMIN_REGISTRATION_SECRET` now gates two capabilities (create a new admin; reset any admin's
  password) instead of one. If this secret is ever rotated, both capabilities move together,
  which is the correct behavior — they are the same trust boundary, not two that happened to
  reuse one value.
- Every admin session is killed on a reset, including the admin performing it (if they were
  logged in elsewhere) — expected and desired, not a bug to work around.
- This does not add rate-limiting or lockout to `loginAdmin` itself — that gap (also named in the
  same deep-dive research this record originates from) is unaffected by this change and remains
  open as its own item if the user wants it addressed separately.

## Open questions

- Whether resetting should also force `isActive: false → true` if the account had been
  deactivated — not addressed here; current decision only touches `passwordHash` and refresh
  tokens, leaving `isActive` exactly as it was.
- Whether a UI affordance ("Forgot password?" on the admin login page, calling this endpoint with
  an admin-entered secret) is wanted later — named in Decision item 4 as deliberately out of
  scope, not forgotten.
- Whether `ADMIN_REGISTRATION_SECRET` should eventually be split into two separate secrets (one
  for registration, one for reset) if the operational need to delegate them separately ever
  arises — not needed at current admin-team scale; flagged so a future reader knows this was
  considered, not overlooked.

## Sources

- `apps/backend/src/modules/auth/auth.service.ts` (`registerAdmin`, `loginAdmin`,
  `assertValidAdminRegistrationSecret`, `refresh`'s reuse-detection revocation pattern)
- `apps/backend/src/modules/auth/auth.controller.ts`
- `apps/backend/src/modules/auth/dto/admin-register.dto.ts`,
  `admin-login.dto.ts` (the DTO shape this record's new DTO mirrors)
- `apps/backend/src/config/configuration.ts` (`admin.registrationSecret`)
- This session's earlier deep-dive research into the `auth` module (MSG91/OTP confirmed real,
  no admin lockout, no admin password-reset path — the three findings that originated this
  record and the still-open lockout item)
