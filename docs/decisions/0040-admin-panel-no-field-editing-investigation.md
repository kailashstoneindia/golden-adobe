# 0040 — "Why can't I edit anything in the admin panel?" — investigation

- **Date:** 2026-10-21
- **Status:** Accepted (investigation closed; no fix needed, no build decided yet)
- **Supersedes / Superseded by:** —

## Context

Client question (2026-10-18, see [0035](0035-client-feedback-triage-2026-10-18.md) Q1): "Why am
I not able to edit anything in the admin panel? These entries are not editable." Logged at the
time as needing reproduction before it could be scoped as a bug or a feature request — this
record is that investigation, following this project's systematic-debugging discipline (root
cause before any fix).

## Investigation

Checked every admin page (`apps/admin/src/pages/*.tsx`) and every mutation hook defined anywhere
in the admin frontend (`apps/admin/src/queries/*.ts`) against the backend write endpoints that
back them.

**What actually has write capability today:**

| Area            | Mutations that exist                                                                                                                                                              | What they do                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Users/Approvals | `useApproveUserMutation`, `useRejectUserMutation` → `PATCH /admin/users/:id/approve`, `PATCH /admin/users/:id/reject`                                                             | Workflow state transitions only                     |
| Vendors         | `useSetVendorCityMutation`, `useSetVendorCategoriesMutation` → `PATCH /admin/vendors/:id/city`, `PUT /admin/vendors/:id/categories`                                               | Two specific admin-owned fields                     |
| Catalog         | `usePublishProductMutation`, `useUnpublishProductMutation`, `useBulkPublishProductsMutation`, `useUploadImportMutation`, `useLinkReviewRowMutation`, `useRejectReviewRowMutation` | Status transitions and bulk import, not field edits |

**What does not exist anywhere, frontend or backend:** a general "edit this record's fields"
capability. Confirmed directly:

- `UserDetailModal.tsx` (the modal used for both the Users list and the Approvals review flow)
  renders every field — role, phone, status, onboarding state, joined date, last login, and the
  vendor's shop name/address/GSTIN/bank details when the user is a vendor — through a single
  `DetailRow` component that only displays `value` as static text. No `<input>`, `<select>`, or
  any editable element exists in the file.
- `admin.controller.ts` exposes exactly `PATCH users/:id/approve` and `PATCH users/:id/reject`
  for users — no `PATCH /admin/users/:id` for general field edits.
- Catalog's lack of single-product edit is already documented as a known, deliberate gap in
  `catalog-implementation-status.md`: _"Deliberately not built: product create/edit... a
  single-product form is a useful later addition for corrections rather than a prerequisite for
  operating the catalog."_
- Ruled out a permissions bug: the only `disabled` states in `VendorDetailModal.tsx` are
  ordinary `isSubmitting`/loading guards, and `admin.controller.ts`'s `@Roles(Role.ADMIN)` is a
  blanket class-level guard applied equally to every endpoint — nothing selectively blocks one
  feature while allowing others.

## Decision

> **This is not a bug.** The admin panel was built around the specific workflows each phase
> needed (approve/reject, publish/unpublish, pin a vendor's city, set their categories), not as
> a general-purpose record editor. The client's observation is accurate: almost nothing in the
> panel can be edited, because that capability was never built, on either the frontend or the
> backend, for almost any entity.
>
> **No fix is proposed or applied by this record.** Per [0038](0038-admin-panel-incremental-delivery.md),
> small admin asks can be built incrementally now rather than waiting for Phase 4 — but _which_
> fields need to become editable, for _which_ entities, is a scoping question for the client, not
> an engineering guess. Building a generic editor for every field on every screen would be
> speculative scope this project's own conventions already warn against.

## Why

Per this project's systematic-debugging discipline, root cause had to be established before any
fix was proposed — and the root cause here is an absent feature, not a defect in an existing
one. Guessing which specific fields the client actually needs to edit (name correction? vendor
bank details? category rename, now already handled in 0035/PR #21?) without asking would risk
building the wrong thing, the same risk 0035 and 0036 already flagged for other client asks that
arrived without enough specificity to scope directly.

## Consequences

- [0035](0035-client-feedback-triage-2026-10-18.md) Q1 is now resolved from "needs reproduction"
  to "reproduced, understood, not a bug" — the open item going forward is a feature-scoping
  conversation with the client, not a debugging task.
- No code changes in this record.

## Open questions

- Which specific fields/entities the client actually needs to edit from the admin panel — not
  answerable from the codebase alone, needs a direct question back to the client before any
  design or build work starts.
