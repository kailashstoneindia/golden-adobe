# 0048 — Vendor approval status field: distinguishing pending from rejected

- **Date:** 2026-10-31
- **Status:** Implemented — backend (`8a97fbd`) and admin UI (`201e9f9`), both on `main`
- **Supersedes / Superseded by:** —

## Context

[0037](0037-phase-2-remaining-work-plan.md) batch 3 item 5 flagged, but deliberately did not
build, a vendor-specific status field separate from the generic `User.isApproved` boolean. This
record resolves that open item.

Ground-truth check against current code (not the 0037-era assumption) found the actual gap is
narrower than "no reject path exists" — a reject endpoint already works:
`PATCH /admin/users/:id/reject` (`AdminController.rejectUser`,
[admin.controller.ts:56-61](../../apps/backend/src/modules/admin/admin.controller.ts#L56)) calls
`AdminService.rejectUser` ([admin.service.ts:123-128](../../apps/backend/src/modules/admin/admin.service.ts#L123)),
which sets `isApproved: false` and logs an optional reason — never persisted. The admin UI
already calls it (`ApprovalsPage.tsx`'s `rejectMutation`, wired to `adminService.rejectUser`).

**The real gap: `isApproved: false` cannot be told apart from "never reviewed."** A vendor who
registers (`isApproved` defaults `false`) and a vendor an admin explicitly rejected are stored
identically. Consequences, confirmed by reading the code paths involved:

- A rejected vendor can simply log back in and their account looks exactly like a fresh pending
  application — nothing stops them reappearing in the approvals queue, and nothing tells admin
  this vendor was already rejected once (and why).
- The rejection reason admin typed is logged (`this.logger.log(...)`,
  [admin.service.ts:126](../../apps/backend/src/modules/admin/admin.service.ts#L126)) and then
  gone — not stored on the row, not shown anywhere again, not visible to the vendor.
- `AdminService.getDashboardStats` ([admin.service.ts:49-82](../../apps/backend/src/modules/admin/admin.service.ts#L49))
  counts `pendingVendors` as `isApproved: false` — a rejected vendor inflates the "pending"
  count admin sees on the dashboard, identically to a vendor who genuinely hasn't been reviewed
  yet.
- `ListUsersQueryDto`'s `isApproved` filter (`AdminService.buildListWhereClause`,
  [admin.service.ts:130-154](../../apps/backend/src/modules/admin/admin.service.ts#L130)) cannot
  produce a "rejected only" list — there is no such list anywhere in the admin app.

Scope note: artisans have the identical structural gap (`Artisan.isVerified: false` is equally
pending/rejected-ambiguous, confirmed at
[artisans.service.ts:49-50](../../apps/backend/src/modules/artisans/artisans.service.ts#L49) and
[:335](../../apps/backend/src/modules/artisans/artisans.service.ts#L335)). This record is scoped
to **vendors only**, per the user's explicit choice of which partial module to harden first.
Artisans already have a richer two-gate verification surface
(`ArtisanVerificationPage`, `PENDING_VERIFICATION_WHERE`) that this record does not touch; the
same fix can be applied there later as its own record if wanted.

## Options considered

### Where the status lives

#### Option A — New `status` enum column directly on `Vendor`

- **Pro:** `Vendor` is the vendor-specific table; onboarding, city, categories, and now status all
  live together. No join needed to answer "is this vendor approved/rejected/pending." Matches
  this module's own existing pattern of vendor-specific columns added incrementally
  (`has_loading_unloading_team` via 0036, `min_order_value` via 0043) rather than growing `User`.
- **Con:** `User.isApproved` still exists and is still the actual authorization gate every guard
  checks (`JwtAuthGuard`/route guards don't read `Vendor.status`) — two columns now describe
  related-but-distinct facts (`isApproved`: can this account act as an approved vendor today;
  `Vendor.status`: the full history/reason of how it got there), which needs to be kept in sync
  deliberately rather than merged into one.

#### Option B — Replace `User.isApproved` with a generic `User.approvalStatus` enum, shared by vendors and artisans

- **Pro:** One column, one enum, covers both roles that need approval; no new table-specific
  column.
- **Con:** Rejected outright by the user's own scoping of this task to "vendor status field,"
  and it reopens a decision (artisans' approval model) not asked for here. It would also force
  a simultaneous migration of `AuthGuard`-adjacent logic and the artisan verification surface
  that 0037 explicitly deferred as its own question. Expanding scope here contradicts the
  project's established pattern of small, single-concern records (0037's own Batch 3 framing).

#### Option C — Keep `isApproved` boolean, add only a nullable `rejectionReason` column, infer "rejected" some other way

- **Pro:** Smallest possible schema change.
- **Con:** Does not solve the actual problem — there would still be no way to distinguish
  "never reviewed" from "rejected, no reason given" from "re-applied after rejection." A reason
  column with no status to hang it off is not enough information to render a real UI state.

**Decision: Option A.** A new `status` column on `Vendor`
(`PENDING | APPROVED | REJECTED`), with `User.isApproved` kept as the authorization boolean it
already is everywhere in the guard/route layer — unchanged, so nothing that currently reads
`isApproved` needs to change. `Vendor.status` is the richer, vendor-facing record of *how* that
boolean got set, written alongside it from the same admin actions.

### Keeping the two fields in sync

#### Option A — `VendorsService` methods wrap `AdminService.approveUser`/`rejectUser`, writing both columns in one transaction

- **Pro:** Single source of truth for the transition logic; `isApproved` and `Vendor.status` can
  never drift, because one call site sets both.
- **Con:** Requires `AdminService.approveUser`/`rejectUser` to become vendor-aware (currently
  role-agnostic, shared with artisans) — needs a role check inside, or a vendor-specific method
  that `AdminVendorsController` exposes instead of reusing the generic one for vendors going
  forward.

#### Option B — Leave `AdminService.approveUser`/`rejectUser` untouched; add a DB-level default/sync (trigger or model hook)

- **Pro:** Zero changes to existing approve/reject call sites.
- **Con:** Hides the sync logic in a trigger/hook, which this codebase does not otherwise use
  for cross-table consistency (every other derived-state concern here — e.g. `booking_id`
  attribution, 0045 — is done explicitly in a service method, not a DB trigger). Harder to test,
  harder for the next reader to find.

**Decision: Option A.** Add `approveVendor(vendorId, adminUserId?)` and
`rejectVendor(vendorId, reason)` to `VendorsService`, called from `AdminVendorsController`
(new routes, see Decision below) instead of routing vendor approval through the generic
`AdminController`/`AdminService` path. `AdminService.approveUser`/`rejectUser` remain as-is for
artisans (and as a fallback/generic path) — not removed, not vendor-scoped further here.

## Decision

> 1. **Migration**: add `status` column to `vendors` —
>    `ENUM('PENDING', 'APPROVED', 'REJECTED')`, `NOT NULL DEFAULT 'PENDING'`. Also add
>    `rejection_reason` (`TEXT`, nullable) and `status_updated_at` (`TIMESTAMPTZ`, nullable) so
>    the reason and the moment of decision are both persisted — closing the "reason is logged
>    then gone" gap named above. Backfill existing rows:
>    `UPDATE vendors SET status = 'APPROVED', status_updated_at = now() WHERE user_id IN (SELECT id FROM users WHERE is_approved = true)`,
>    all other existing rows stay `PENDING` (none are known-rejected today, since rejection has
>    never been distinguishable until now — there is nothing to backfill into `REJECTED`).
> 2. **Model**: add `status`/`rejectionReason`/`statusUpdatedAt` to `Vendor`
>    ([vendor.model.ts](../../apps/backend/src/modules/vendors/models/vendor.model.ts)), following
>    the existing column-comment convention that file already uses for `hasLoadingUnloadingTeam`
>    and `minOrderValue`.
> 3. **Service methods** on `VendorsService`:
>    - `approveVendor(vendorId: string)` — sets `Vendor.status = 'APPROVED'`,
>      `statusUpdatedAt = now()`, clears `rejectionReason` to `null` (a vendor approved after a
>      prior rejection shouldn't keep showing the old reason), and sets `User.isApproved = true`
>      in the same transaction (`sequelize.transaction`, matching this module's existing
>      transactional-onboarding pattern).
>    - `rejectVendor(vendorId: string, reason: string)` — `reason` required (not optional, unlike
>      today's log-only `AdminService.rejectUser` — a persisted reason with no value defeats the
>      point of persisting it). Sets `Vendor.status = 'REJECTED'`, `rejectionReason = reason`,
>      `statusUpdatedAt = now()`, and `User.isApproved = false`, same transaction.
> 4. **Controller routes** on `AdminVendorsController`
>    ([admin-vendors.controller.ts](../../apps/backend/src/modules/vendors/admin-vendors.controller.ts)):
>    - `PATCH /admin/vendors/:id/approve` → `VendorsService.approveVendor`.
>    - `PATCH /admin/vendors/:id/reject` (body: `{ reason: string }`, validated non-empty via DTO)
>      → `VendorsService.rejectVendor`.
>    - These are **additive** — `PATCH /admin/users/:id/approve`/`reject` keep working exactly as
>      today for artisans and as a generic fallback; not removed, not redirected.
> 5. **Types** (`packages/types/src/vendor.types.ts`): add `status: 'PENDING' | 'APPROVED' |
>    'REJECTED'`, `rejectionReason: string | null`, `statusUpdatedAt: string | null` to
>    `VendorProfileDto`, surfaced via `vendor-profile.mapper.ts`'s existing
>    `toVendorProfileDto` — so every place that already reads a vendor profile (admin list/detail,
>    `UserDto.vendorProfile`) gets the new fields with no separate endpoint needed.
> 6. **Admin UI**:
>    - `ApprovalsPage.tsx`'s reject action switches from calling
>      `adminService.rejectUser`/`useRejectUserMutation` (generic) to a new
>      `vendorsService.rejectVendor`/`useRejectVendorMutation` **for vendor rows specifically**
>      (artisan rows keep calling the existing generic path — this page already handles both
>      roles, so the switch is conditional on role, not a page-wide change).
>    - `VendorsPage.tsx` gains a status badge (Pending/Approved/Rejected) and, for `REJECTED` rows,
>      visible `rejectionReason` + `statusUpdatedAt` — the first place this reason is ever shown
>      anywhere after being typed.
>    - `AdminDashboardStats`'s `pendingVendors` count changes source from
>      `User.isApproved = false` to `Vendor.status = 'PENDING'`
>      ([admin.service.ts:59](../../apps/backend/src/modules/admin/admin.service.ts#L59)) so a
>      rejected vendor stops inflating the pending count — this is the one existing query this
>      record's decision requires changing, since it is the one place currently conflating the
>      two states in a number admin actually looks at.

## Why

Option A (new column on `Vendor`, not replacing `User.isApproved`) was chosen because
`isApproved` is load-bearing everywhere auth/route guards check it today — changing its meaning
or removing it would touch every guard in the codebase for a problem that is really about
*admin's visibility into vendor history*, not about *authorization*. Keeping both, with
`Vendor.status` as the richer record and `isApproved` as the simple gate, mirrors how artisans
already separate `isVerified` (gate) from the richer `ArtisanHireRequestStatus` state machine
(0045) — proven pattern in this exact codebase, not a new idea.

Routing vendor approve/reject through new `VendorsService` methods (sync Option A) rather than
hooking the existing generic `AdminService` methods keeps the vendor-specific logic (reason
required, clearing a stale reason on re-approval) where vendor-specific logic already lives in
this codebase — `VendorsService` already owns onboarding, city, and category-adjacent vendor
state.

## Consequences

- One migration, one model change, two new service methods, two new routes, a `VendorProfileDto`
  type addition, and an admin UI change to `ApprovalsPage`/`VendorsPage` — small enough to be one
  PR, matching this project's established granularity.
- `AdminService.approveUser`/`rejectUser` are now technically redundant for vendors specifically
  but are **not removed** — they still serve artisans and remain a generic fallback. Flagging
  this now so a future reader doesn't assume they were missed; they were deliberately kept.
- `AdminDashboardStats.pendingVendors`'s source query changes — the one existing behavior this
  record alters, not just adds to.
- A rejected vendor who re-applies (re-submits onboarding) is not specially handled here —
  current onboarding flow does not check `Vendor.status` before accepting a resubmission. Whether
  a `REJECTED` vendor should be blocked from onboarding again, or should flow back to `PENDING`
  automatically, is an open question below, not decided in this record.

## Open questions

- Should a rejected vendor be able to re-submit/re-onboard at all, and if so, does that
  automatically flip `status` back to `PENDING`, or does it require a separate admin action to
  "reopen" them? Not designed here — current onboarding endpoints
  (`VendorsController.onboard`) have no status check today and this record does not add one;
  flagged for a follow-up if the client asks for it.
- Whether the vendor should see their own `rejectionReason` (vendor-facing, not just
  admin-facing) — not decided here. `VendorProfileDto` carries the field either way per item 5
  above, but whether the vendor-facing read path (`VendorsController`'s own-profile endpoint)
  should expose it, versus redacting it to admin-only, is left to implementation judgment unless
  the user specifies otherwise before building.
- The identical gap on artisans (`isVerified`) is named in Context but intentionally out of
  scope — a future record can apply the same shape there if wanted.

## Sources

- [0037-phase-2-remaining-work-plan.md](0037-phase-2-remaining-work-plan.md) (batch 3, item 5 —
  the original open item this record resolves)
- `apps/backend/src/modules/admin/admin.service.ts`, `admin.controller.ts` (existing
  approve/reject behavior, confirmed by direct read, not assumed)
- `apps/backend/src/modules/vendors/models/vendor.model.ts`,
  `apps/backend/src/modules/vendors/admin-vendors.controller.ts`,
  `apps/backend/src/modules/vendors/vendors.service.ts`
- `apps/backend/src/modules/artisans/artisans.service.ts` (`PENDING_VERIFICATION_WHERE`,
  `isVerified` — the structurally identical, deliberately out-of-scope artisan case)
- `apps/admin/src/pages/ApprovalsPage.tsx`, `VendorsPage.tsx`,
  `apps/admin/src/services/api/adminService.ts`
- `packages/types/src/user.types.ts`, `vendor.types.ts` (to be extended, per Decision item 5)
