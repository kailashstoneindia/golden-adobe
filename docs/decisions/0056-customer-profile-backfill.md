# 0056 — Customer profile backfill and atomic registration

- **Date:** 2026-11-04
- **Status:** Implemented (pending merge)
- **Supersedes / Superseded by:** —

## Context

Adding a product to the cart in the customer app sometimes failed with
`no customer profile found for this user`.

That message is thrown by `CustomersService.resolveCustomerByUserId`
([customers.service.ts](../../apps/backend/src/modules/customers/customers.service.ts)), which every
cart, checkout, order and address call goes through. A customer needs **two** rows: a `users` row
(the login) and a `customers` row (the shopping profile, decision 0041). The cart only works if
both exist.

Two independent ways to end up with a login and no profile:

1. **Accounts registered before the `customers` table existed.**
   `20261008090000-create-customers.js` created the table without backfilling it, and
   `AuthService.register` only creates the row for users registering after that point. Confirmed on
   the local database: its one CUSTOMER user (created 2026-07-19) had no `customers` row. This is
   why the error is intermittent from the tester's side — it depends on which account is logged in.
2. **Registration itself was not atomic.** `register` inserted the user, then inserted the
   `customers` row as a second, unrelated write. A failure of the second left a half-created account
   that nothing repaired, and a retry could not help: the phone number already existed
   (`ConflictException`).

## Options considered

### Option A — Backfill migration plus transactional register (chosen)

- **Pro:** fixes existing accounts once, in the schema history where the gap was introduced, and
  closes the only code path that can create a new orphan. No runtime cost on the cart path.
- **Con:** two changes instead of one; the migration must run on every environment (it is
  idempotent, so re-running is harmless).

### Option B — Self-heal in `resolveCustomerByUserId` (create the row on first miss)

- **Pro:** repairs any orphan, whatever its cause, with no migration to remember.
- **Con:** a read path that writes. It needs the user's name at a point where the code only has a
  user id, and it hides the cause: a bug that starts producing orphans again would go unnoticed
  instead of failing loudly. Concurrent first requests would also race on the unique
  `customers.user_id`.

### Option C — Make `customers` optional and create it lazily at first address/checkout

- **Pro:** no orphans by construction.
- **Con:** contradicts decision 0041 rule 1 (a cart belongs to a customer, 1:1 with users) and would
  touch every cart/order service. Far larger than the defect.

## Decision

**Option A.**

- Migration `20261104100000-backfill-missing-customer-profiles.js` inserts a `customers` row for
  every CUSTOMER user without one. `full_name` comes from `users.name`; `users.name` is nullable and
  `customers.full_name` is not, so a missing or blank name becomes `'Customer'`. It is idempotent
  (it only touches users with no row). `down` is a no-op because a backfilled row cannot be told
  apart from a real one, and deleting profiles on rollback would orphan carts and addresses
  attached since.
- `AuthService.register` runs the user insert and the `customers` insert inside one
  `sequelize.transaction`. `UsersService.create` and `CustomersService.createForUser` take an
  optional `transaction`; the re-read inside `UsersService.create` uses it too, because inside an
  open transaction the new row is invisible to any other connection. If the profile insert fails,
  the user insert rolls back and the person can register again.
- Option B was rejected on purpose: the resolver stays a pure read, so a future regression shows up
  as an error rather than being silently patched.

## Consequences

- The migration must be run on **every** environment that has pre-0041 customers, including AWS
  production. Until it runs there, affected accounts still see the error. Running a migration on
  production needs the user's explicit go-ahead.
- Only the CUSTOMER role is covered. Vendors and artisans have their own profile tables and
  onboarding steps and are not affected by this path.
- New unit spec `auth.service.register.spec.ts` pins that the user and customer writes share one
  transaction and that a failed profile insert issues no tokens.
- `AuthService` now injects `Sequelize`, so any spec that builds it from providers must supply one
  (`auth.service.reset-admin-password.spec.ts` was updated).
