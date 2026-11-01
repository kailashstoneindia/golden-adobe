# 0052 — Mobile-dev artisan gaps, Batch B (browse/search, team document upload)

- **Date:** 2026-11-01
- **Status:** Implemented
- **Supersedes / Superseded by:** —

## Context

[0051](0051-mobile-dev-artisan-gaps-batch-a.md) covered the four contained fixes from the mobile
developer's ten-item gap report. The remaining three needed product/design decisions before any
code could be written:

1. No customer-facing artisan browse/search endpoint.
2. Hire-request status changes only reach a server log line (`LogNotificationService`) — no real
   push notification exists.
3. Team-member document persistence exists (`ArtisanTeamMemberInputDto.documentUrl`) but there
   is no dedicated presign/confirm upload flow for it — only the lead artisan's own KYC document
   has one.

All three were resolved with the user directly:

- **Browse/search**: filter by trade type and pincode. Built this record.
- **Push notifications**: the user asked _why it's needed_ before committing to a provider.
  Re-examined: the only effect of skipping it is that a customer/artisan has to reopen the app
  to see a status change — current status is always correct and visible on open, nothing is
  lost or broken, only delayed awareness. Decided: **skip entirely for this pass** — not a
  correctness gap, a polish item to revisit if it's actually reported as a problem by real
  users. No code change.
- **Team document upload**: "simpler." Resolved as reusing the existing presign endpoint rather
  than building a second upload flow — see Decision below.

## Options considered

### Browse/search: what counts as a match

#### Option A — Exact-match filters only (tradeType equality, pincode equality)

- **Pro:** `Artisan` has no `lat`/`lng` columns today (only `servicePincode`, a plain string) —
  exact match is the only thing the current schema actually supports without a new migration.
  Matches the scope the user asked for: "filter by trade type and pincode," not "find artisans
  near me."
- **Con:** A customer one pincode away from a perfectly good artisan gets zero results, not a
  ranked-by-distance list.

#### Option B — Radius/geo search

- **Pro:** Better match quality, matches how the product catalog's own search module already
  resolves a city from pincode/coordinates (`search-query.dto.ts`).
- **Con:** Needs new columns (`lat`/`lng` on `Artisan`), a geocoding step at onboarding, and a
  distance calculation at query time — a materially bigger change than what was asked for, and
  speculative before any real usage data shows pincode-exact-match is actually insufficient.

**Decision: Option A.** Confirmed with the user ("filter by trade type and pincode").

### Team-document upload: new flow vs. reuse

#### Option A — Generalize the existing presign endpoint with an optional `purpose`

- **Pro:** No new S3 flow, no second confirm step, no new controller route. `purpose: 'lead'`
  (default) behaves exactly as before; `purpose: 'team_member'` mints a key one sub-path deeper
  (`artisans/<id>/team/...`) that the _existing_ `assertOwnedDocumentKey` prefix check already
  accepts — confirmed by the pre-existing test `'accepts a team member documentUrl under the
artisan own prefix'`, which already exercised a `team/` sub-path key before this record, it
  just had no presigned URL to actually upload to. The client calls the same endpoint it already
  knows, gets back a presigned POST, uploads, then passes the resulting key straight through to
  `addTeamMember`/`updateTeamMember` — no confirm step, matching the existing, deliberate
  "team-member documents have no existence check" design already documented in
  `assertOwnedDocumentKey`'s own comment.
- **Con:** A single endpoint now serves two slightly different purposes, distinguished by one
  optional field — a caller who doesn't read the Swagger description could miss that `purpose`
  exists and always get a lead-shaped key.

#### Option B — A second, dedicated presign endpoint for team-member documents

- **Pro:** One endpoint, one purpose each — no branching inside `createUploadUrl`.
- **Con:** Near-total duplication of the existing method (same content-type validation, same
  size/TTL constants, same `storage.presignPost` call) for a one-line difference in the key
  shape. Two endpoints to document, two to maintain, for logic that is otherwise identical.

**Decision: Option A.** Confirmed with the user ("simpler" — reusing the existing endpoint is
less code and less surface area than a second one that does almost the same thing.

## Decision

> 1. **`GET /artisans`** (new, any authenticated role, matching `:id/public`'s own "verified
>    artisans are meant to be discoverable" visibility rule) — paginated, optional
>    `?tradeType=&pincode=` exact-match filters, `isVerified: true` unconditionally. Returns
>    `ArtisanPublicProfileDto[]` (bio-only — no `servicePincode`, `documentUrl`, or
>    `accountDetails` leak into results, same privacy contract `:id/public` already enforces).
>    New types: `ArtisanSearchQuery`, `PaginatedArtisanPublicProfilesResponse`
>    (`packages/types/src/artisan.types.ts`). New service method
>    `ArtisansService.searchPublic(page, limit, { tradeType?, pincode? })`. New DTO
>    `SearchArtisansQueryDto`, reusing the catalog search module's own 6-digit pincode regex
>    (`/^[1-9][0-9]{5}$/`) for consistency.
> 2. **No change** for push notifications. `LogNotificationService` stays the only
>    implementation; the existing `sendHireRequestStatusChanged` call sites (decision 0045)
>    remain exactly as they are.
> 3. **`POST /artisans/me/documents/upload-url`** gains an optional `purpose: 'lead' |
'team_member'` field on `CreateDocumentUploadUrlDto`, defaulting to `'lead'`.
>    `ArtisansService.createUploadUrl` takes the new parameter and mints
>    `artisans/<id>/team/doc-<uuid>.<ext>` instead of `artisans/<id>/doc-<uuid>.<ext>` when
>    `purpose: 'team_member'`. No new confirm step, no new controller route.

Built test-first throughout: new DTO validation specs (`create-document-upload-url.dto.spec.ts`
gains the `purpose` cases), new `ArtisansService.searchPublic` unit tests (verified-only
filtering, tradeType filter, pincode filter, combined filter, privacy-shape assertion), new
`ArtisansService.createUploadUrl` unit tests (key-shape assertions for both purposes via a
`jest.spyOn` on the existing `FakeObjectStorage`, plus an end-to-end test that a `team_member`
purpose key round-trips through `addTeamMember` successfully), new HTTP-level controller tests
for `GET /artisans` (verified-only, filtered, privacy-shape). One deliberate regression check
(temporarily removed the `where` filter branches, confirmed three tests failed for the right
reason, restored).

## Why

Reusing the existing presign endpoint (item 3) rather than building a parallel one follows the
same reasoning [0051](0051-mobile-dev-artisan-gaps-batch-a.md) already used for the single
hire-request read and the artisan order-detail access: when two code paths converge on an
near-identical shape, branch inside one method rather than duplicate it into two. The
`team/` sub-path was already a legal `documentUrl` value before this record (the prefix check
only ever cared about `artisans/<id>/`, not what came after) — this record closes the one real
gap, which was that nothing minted a presigned URL shaped that way, not a design flaw in the
existing ownership check.

Skipping push notifications isn't a cost-cutting shortcut — it was a direct answer to "why do we
need it," and the honest answer is that nothing is incorrect without it, only slower to notice.
Building infrastructure (device tokens, a new `NotificationService` implementation, mobile-side
permission prompts) for a problem that hasn't been shown to matter yet would be exactly the kind
of speculative work this project's own conventions already discourage.

## Consequences

- `GET /artisans` is the first bare, paramless `GET` on `ArtisansController` — confirmed it
  creates no route-ordering risk against the controller's existing dynamic routes (`:id/public`,
  `hire-requests/:id`, etc.), since a fully static path is never shadowed by a dynamic one
  regardless of registration order; only two _dynamic_ routes at the same position need careful
  ordering, which doesn't apply here.
- `CreateDocumentUploadUrlDto.purpose` is optional and defaults to `'lead'`, so every existing
  caller (the mobile app's own KYC-document upload, built before this record) keeps working
  with zero changes required on its part.
- If a customer complains about not knowing when a hire request changes status, that's the
  signal to revisit the "skip notifications" call — not a backend code change needed to detect
  it, just a product conversation.

## Open questions

- None outstanding for this record. If browse/search later needs ranking, radius search, or
  additional filters (availability, rating once reviews exist), that's new scope for a future
  record, not implied here.

## Sources

- [0051-mobile-dev-artisan-gaps-batch-a.md](0051-mobile-dev-artisan-gaps-batch-a.md)
- `apps/backend/src/modules/artisans/artisans.service.ts` (`getPublicProfile`,
  `assertOwnedDocumentKey`, new `searchPublic`, `createUploadUrl`)
- `apps/backend/src/modules/artisans/artisans.controller.ts` (new `search`, updated
  `createUploadUrl`)
- `apps/backend/src/modules/search/dto/search-query.dto.ts` (the pincode regex precedent)
- `apps/backend/src/modules/notifications/log-notification.service.ts`
- Mobile developer's gap report and the user's own direct answers on scope (this session,
  2026-11-01)
