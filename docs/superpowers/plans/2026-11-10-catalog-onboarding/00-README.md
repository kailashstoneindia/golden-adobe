# Catalog onboarding implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (one session per file) or
> superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. **Read only this file plus your
> session file** and the spec sections it names. Do not read the other session files.

**Goal:** Client staff can onboard brands and products from the admin panel without a developer, and fix mistakes.

**Architecture:** Extend the existing `catalog` module (`apps/backend/src/modules/catalog/`) and admin app. New
brand admin API; richer product edit/retire/delete/merge; readiness checks enforced on publish; imports move to a
BullMQ background job with history; small admin screens for each.

**Tech Stack:** NestJS 11, Sequelize, PostgreSQL, BullMQ (already used by search indexing), S3/MinIO object storage,
jest; React + Vite + TanStack Query, vitest; shared types in `packages/types`.

**Spec:** [../../specs/2026-11-10-catalog-onboarding-design.md](../../specs/2026-11-10-catalog-onboarding-design.md)
**Decisions:** [0062](../../../decisions/0062-catalog-onboarding-design.md), findings in [0061](../../../decisions/0061-catalog-onboarding-review.md)

## Global Constraints

- Branch `feat/catalog-onboarding` from `main`. **Do not merge or deploy**; ask the user which merge method first.
- **Never edit `apps/mobile`** (owned by another developer).
- Pre-launch: production rows are test data. No backfills or grandfathering.
- Read the neighbouring file named in each task for the pattern before writing.
- Commit messages: `Catalog: <what> (decision 0062)` with the repo's usual `Co-Authored-By` line.
- Backend tests: `pnpm --filter @golden-abode/backend test -- <path-or-name>`. Admin tests:
  `pnpm --filter @golden-abode/admin exec vitest run <path>`. Typecheck before each commit:
  `pnpm --filter @golden-abode/backend exec tsc --noEmit` (and admin for UI sessions).
- Migrations: `apps/backend/database/migrations/YYYYMMDDHHMMSS-name.js`, run with `pnpm --filter @golden-abode/backend migration:run`.
- Local runs use the `golden_abode_test` database on port-spare servers (recipe in the user's `verify-ui-with-playwright`
  memory). Never touch production. UI sessions end with a Playwright browser check; clean up seeded rows afterwards.
- New DTOs use `class-validator` + `@ApiProperty` like the neighbours. All routes `@Roles(Role.ADMIN)`.
- Any new design choice goes into decision 0062 (not only chat).

## Review Focus

1. Brand typed in any case or with a suffix (`HAVELLS`, `havells ltd`) resolves; a merged brand's old name still resolves (S1, S2).
2. Merging products when the same vendor lists both: one listing survives, the other is paused, none deleted (S5).
3. A retired product cannot be bought: its listings are paused and publish/restore rules hold (S4).
4. Publishing without an image is refused, also in bulk, also by the API directly; a missing HSN code only warns (S4).
5. Background import survives a bad row, a bad file, and a worker restart without duplicating products (S7).

## Sessions

| # | File | Delivers | Needs |
|---|---|---|---|
| S1 | [01-schema-and-resolver.md](01-schema-and-resolver.md) | Migration, models, resolver fixes | none |
| S2 | [02-brands-api.md](02-brands-api.md) | Brand admin API incl. merge | S1 |
| S3 | [03-brands-ui.md](03-brands-ui.md) | Brands page | S2 |
| S4 | [04-product-api.md](04-product-api.md) | Edit, retire, delete, readiness, publish rules, HSN defaults | S1 |
| S5 | [05-product-merge.md](05-product-merge.md) | Product merge | S4 |
| S6 | [06-product-ui.md](06-product-ui.md) | Products list, add/edit form, actions | S3, S5 |
| S7 | [07-background-import-api.md](07-background-import-api.md) | Background import jobs | S1 |
| S8 | [08-import-ui.md](08-import-ui.md) | Import screen: history, progress, errors, undo | S7 |
| S9 | [09-review-queue-create.md](09-review-queue-create.md) | Create product from a review row | S6 |
| S10 | [10-bulk-images.md](10-bulk-images.md) | Bulk image upload by product code or part number | S6 |
| S11 | [11-wrap-up.md](11-wrap-up.md) | Browser check, docs, status | all |

S2/S4/S7 can run in any order after S1. S3 can run alongside S4.

## Progress (tick and commit at the end of each session)

- [ ] S1 schema and resolver
- [ ] S2 brands API
- [ ] S3 brands UI
- [ ] S4 product API
- [ ] S5 product merge
- [ ] S6 product UI
- [ ] S7 background import API
- [ ] S8 import UI
- [ ] S9 review queue create
- [ ] S10 bulk images
- [ ] S11 wrap-up

## Starting a session (paste this)

> Implement session SN of the catalog onboarding plan. Read
> `docs/superpowers/plans/2026-11-10-catalog-onboarding/00-README.md` and `NN-name.md` only, plus the spec sections
> they cite. Use superpowers:executing-plans. Tick the progress box in 00-README when done and commit.
