# Artisan / Ustaad Module — Current State, Scope, and Entity Relationships

**Status:** Reference document, not a decision record. Reflects actual current repo state
(2026-10-23) plus the scope call made the same day (see "Scope decision" below). Supersedes
the vision/schema parts of [`docs/artisan.md`](artisan.md) where they conflict — that document
is older, more speculative, and includes items (wallet withdrawal automation) that are out of
budget, and omits items (police verification) that the client has since asked for and been
told no to. Keep both files; this one is the "what do we actually build and why" version.

---

## 1. What "Artisan" / "Ustaad" means here

One role, two names. `ARTISAN` is the enum/code value
(`packages/types/src/role.enum.ts`); **"Ustaad"** is the Hindi/Urdu label shown to users
everywhere in product UI (mobile registration screen, admin dashboard stat cards,
`formatRoleLabel()` in `apps/admin/src/utils/role.ts`). Use them interchangeably — they are
not two features.

Per the **signed proposal** (`Golden Abode – Home Finishing Marketplace Platform.pdf`, page 4),
the Artisan role is scoped narrowly:

- Create Profile
- Associate With Customer Projects
- Earn Reward Points
- View Reward History

This is a rewards-participant role, not a delivery-validation role, not a KYC/background-check
subject by default. (Two other docs in this repo — `stakeholder-onboarding-guide.md` and
`client-feedback-2026-06-22.md` — describe artisans validating deliveries on-site instead; that
framing is a real discrepancy in the docs and isn't resolved here. This document only covers the
onboarding/profile/approval module, which is the same regardless of which job the artisan ends
up doing once onboarded.)

---

## 2. Scope decision (2026-10-23)

In response to the client's 2026-10-18 feedback item asking for Aadhaar upload + police
verification + service area + bank details + bio-only visibility for Ustaad approval:

| Ask | Decision | Why |
| --- | --- | --- |
| Police verification | **Will not build.** | Not in the signed proposal at all; a background-check workflow (third-party API or manual process, plus a verification-state machine) with no prior estimate or budget line. |
| Aadhaar / ID document upload | **Build.** | Not named in the proposal, but it's a document-storage + admin-review pattern this codebase already has twice (vendor onboarding docs, product media) — low marginal cost, not a new domain concept. |
| Service-area field | **Build.** | A `service_pincode`/location field on the profile. (Note: if "don't throw a distant Ustaad at a customer" later means proximity *matching/filtering* logic rather than just a stored field, that edges toward "Automated Vendor Allocation" / "Hyperlocal Geofencing," which the proposal excludes — revisit scope if it grows into that.) |
| Bank details | **Build (storage only).** | Explicitly excluded from the MVP budget as "Direct Bank Transfers" / "Financial Settlements" (proposal page 10) — but that exclusion is about automated payout/withdrawal, not about having a place to store the numbers. Precedent: `vendors` already has `bank_details`/`upi_id` columns and a full `vendor_account_details` table (account holder, bank name, IFSC, branch, account number) with no payout automation attached. Mirror that pattern for Artisans; building the money-movement side later is a separate, larger piece of work. |
| Bio-only visibility (hide contact info, show bio to customers) | **Build.** | A profile-serialization/display rule on fields that will already exist. Cheapest item in the list. |

**Net effect:** everything from the client's ask ships except police verification. Document
upload, service area, and bank-details *storage* are judged "surfacing/storing existing-shaped
data" rather than "new domain concepts," consistent with how [0038](decisions/0038-admin-panel-incremental-delivery.md)
drew that line for admin-panel work generally.

---

## 3. Current repo state (what exists today)

**Nothing has been built yet beyond the role itself.** Confirmed by checking
`apps/backend/database/migrations/` — there is no `create-artisans` migration, no
`artisan_account_details` equivalent, nothing. Compare to Vendor, which has a full buildout:
`create-vendors`, `create-vendor-account-details`, `create-vendor-category`,
`create-vendor-listing`, `add-vendor-onboarding-progress-to-users`, etc.

What *does* exist:

- `role.enum.ts`: `Role.ARTISAN` is one of four values (`CUSTOMER | VENDOR | ARTISAN | ADMIN`).
- `RegisterDto` allows self-registration with `role: ARTISAN`.
- `users` table has the generic `is_approved` flag (migration `20260626072316`) and
  `last_login_at` (migration `20261020090000`) — both role-agnostic, shared with Vendor.
- `ApprovedGuard` (`apps/backend/src/common/guards/approved.guard.ts:17-34`) gates Vendor and
  Artisan behind `is_approved`; Customer and Admin skip the gate. This is a *generic* flag on
  `users`, not an artisan-specific verification state — see §5 for why that matters.
- Mobile registration screen (`apps/mobile/app/(auth)/register.tsx`) already offers "Ustaad
  (Artisan)" as a role choice and creates the `users` row with `role: ARTISAN` — but there is no
  `artisans` table row to go with it, since the table doesn't exist.
- Demo/seed data: one artisan user row (`"Test Artisan"`, `+916666666666`,
  `is_approved: true`) with no profile fields, because there's no profile table to put them in.
- Admin panel: `ApprovalsPage.tsx` has an `artisans` approval category, `DashboardPage.tsx` has
  a "Pending ustaads" stat card — both read from the generic Vendor/Artisan approval counts on
  `users`, not from anything artisan-specific.

**Implication:** every box below in §4 is new work. There is no partial Artisan schema to
extend — this is a from-scratch module, built on a role that already exists at the auth layer.

---

## 4. Proposed schema (what to build)

Mirrors the Vendor pattern directly: one core profile table + one account-details table,
following the same split Vendor already uses (business/profile fields vs. financial fields in
a separate table, both 1:1 on the parent).

### 4.1 `artisans` — core profile

```sql
CREATE TABLE artisans (
  id                VARCHAR(36)  PRIMARY KEY,
  user_id           VARCHAR(36)  UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  trade_type        ENUM('CARPENTER','PLUMBER','PAINTER','ELECTRICIAN','MASON',
                          'TILE_LAYING','OTHERS') NOT NULL,

  experience_years  INT,
  bio               TEXT,                 -- the ONLY artisan-authored field shown to customers
  service_pincode   VARCHAR(10),          -- service-area field (client ask)
  document_url      TEXT,                 -- Aadhaar / ID proof upload (client ask)

  is_verified       BOOLEAN NOT NULL DEFAULT FALSE,  -- artisan-specific verification state,
                                                      -- distinct from users.is_approved (see §5)
  is_available      BOOLEAN NOT NULL DEFAULT TRUE,

  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 4.2 `artisan_account_details` — bank details (storage only, no payout logic)

Same shape as `vendor_account_details`, same reasoning: keep financial fields out of the core
profile table so they can be access-controlled and audited separately.

```sql
CREATE TABLE artisan_account_details (
  id                   VARCHAR(36) PRIMARY KEY,
  artisan_id           VARCHAR(36) UNIQUE NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
  account_holder_name  VARCHAR     NOT NULL,
  bank_name            VARCHAR     NOT NULL,
  ifsc_code            VARCHAR     NOT NULL,
  branch_name          VARCHAR     NOT NULL,
  account_number       VARCHAR     NOT NULL,
  created_at           TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP   NOT NULL DEFAULT NOW()
);
```

No withdrawal, transfer, or settlement logic reads from this table yet — it exists so the data
is captured once and isn't re-collected later when payout automation is eventually scoped and
budgeted separately.

### 4.3 What's explicitly NOT in this schema

- Any police-verification state machine or third-party background-check integration.
- `reward_points_balance`, `artisan_rewards_ledger` — separate concern (Reward Tracking,
  bundled with Artisan Module in the proposal's Phase 4 line but a distinct piece of work).
- `contractor_id` / team hierarchy — proposal explicitly defers this ("in MVP, all artisans
  operate independently").
- `latitude`/`longitude` — pincode is the agreed MVP granularity for service area; proximity
  matching logic is excluded (see §2 service-area row).

---

## 5. Relation to other entities

```
users (role = ARTISAN, is_approved: bool — generic gate, shared with Vendor)
  │
  └── artisans (1:1)                         ← NEW, this module
        │  is_verified: bool                 ← artisan-specific, see note below
        │
        └── artisan_account_details (1:1)    ← NEW, this module, bank details storage only
```

**Two approval flags will coexist, and that's intentional, not a bug:**

- `users.is_approved` — the generic flag `ApprovedGuard` checks. Same flag Vendor uses. Gates
  basic platform access (can this user do anything beyond browse/log in).
- `artisans.is_verified` — artisan-specific, document/ID-driven. Per `docs/artisan.md`'s
  existing design (§3), this is what actually makes an artisan **discoverable in customer
  search** — a stricter, document-backed condition than the generic approval flag.

Follow that existing split rather than collapsing them: `is_approved` = "allowed to use the
app," `is_verified` = "shown to customers as a vetted Ustaad." An artisan could in principle be
approved (can log in, complete profile) but not yet verified (document still under review, not
searchable).

**Downstream entities this module does not create, but that will eventually reference
`artisans.id`** (out of scope here, listed for completeness since they shape why the schema is
split the way it is): `service_bookings`, `artisan_recommendations`, `artisan_rewards_ledger`,
and the `booking_id` column on `orders`. See `docs/artisan.md` §4–5 for the fuller future
relationship map; none of that is part of this scope decision.

**Visibility rule (bio-only):** customer-facing artisan profile responses must omit phone
number and any other direct contact field, exposing only `bio` (plus name, trade_type,
experience_years, availability, verification badge). This is a serializer/DTO-level concern on
whatever endpoint lists/returns artisan profiles to customers — not a new table.

---

## 6. Admin-side surface

Following the existing Vendor approval pattern (`admin.service.ts`, `admin.controller.ts`,
`ApprovalsPage.tsx`, route `/approvals/artisans`):

- Pending-verification queue reads `artisans` rows where `is_verified = false`, showing profile
  fields + the uploaded document.
- Approve/reject actions, same shape as the existing Vendor/Artisan `users.is_approved`
  approve/reject endpoints, but targeting `artisans.is_verified` specifically once that column
  exists — currently the admin approve/reject endpoints only touch `users.is_approved` and have
  no artisan-specific document-review step to land on.
- Bank details (`artisan_account_details`) should be admin-readable (for eventual payout) but
  not displayed to customers — enforce this the same way the bio-only rule is enforced, at the
  serializer level, keyed to the requesting role.

---

## 7. Open items not settled here

- Exact set of accepted document types (Aadhaar only, or also trade/contractor license) — per
  `docs/artisan.md` §3, "to be confirmed with client."
- Whether service-area eventually needs to be a list of pincodes rather than one — relevant if
  "don't send a distant Ustaad" grows past a single field.
- Where the money-movement half of bank details (withdrawal, settlement) gets scoped and
  budgeted — explicitly deferred, not decided here.
