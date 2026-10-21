# 0038 — Admin panel: incremental delivery, not gated to Phase 4

- **Date:** 2026-10-20
- **Status:** Accepted
- **Supersedes / Superseded by:** —

## Context

The signed proposal (`Golden Abode – Home Finishing Marketplace Platform.pdf`) scopes "Admin
Dashboard, User Management, Product Moderation" as Phase 4 deliverables, tied to that phase's
own ₹40,000 milestone payment. [0035](0035-client-feedback-triage-2026-10-18.md) applied this
literally: every admin-panel item in the client's 2026-10-18 feedback (#3 last-login timestamp,
#5 dashboard pending-approvals view) was marked out of scope and deferred to Phase 4, which has
not started.

The user has now said explicitly (2026-10-20) that this is no longer the right read of the
situation: **admin panel work is being built incrementally, on the go, rather than deferred as
a block to wait for Phase 4.** This is evidenced by the repo's own git history independent of
this conversation — admin panel commits (auth UI, vendor onboarding progress tracking, user
approval flow, product image management, Railway/Vercel deployment config for the admin app)
have been landing continuously on `main` throughout Phase 2 and Phase 3's development, not held
back for a discrete Phase 4 milestone. The phase boundary in the proposal document was never
actually being honored in practice; this record makes that explicit instead of leaving 0035's
blanket "Phase 4, wait" framing to contradict what the codebase already shows.

## Options considered

### Option A — Keep admin panel strictly gated to Phase 4

- **Pro:** Matches the signed proposal's literal wording and milestone-payment structure exactly.
- **Con:** Already contradicted by the actual build history — admin panel code has been shipping
  continuously since before this conversation existed. Re-asserting a strict gate here would be
  describing a policy nobody has been following, making this project's own decision records
  less trustworthy as a description of what's actually happening.

### Option B — Admin panel work proceeds incrementally; Phase 4's milestone becomes a checkpoint, not a start gate

- **Pro:** Matches reality. Small admin asks (a timestamp column, a dashboard panel) get scoped
  and built the same way a Phase 2/3 bug fix would — judged on their own size and risk, not
  deferred wholesale because they technically fall under an "Admin Dashboard" heading.
- **Con:** Blurs the proposal's phase/payment structure. Needs an explicit rule for what still
  waits (see Decision) so "incremental" doesn't silently become "anything admin-shaped gets
  built whenever," which would make the Phase 4 milestone meaningless as a payment checkpoint.

## Decision

> **1. Admin panel work is no longer strictly gated to Phase 4.** Small, self-contained admin
> asks — a new field, a read-only view, a UI polish — are scoped and built incrementally,
> alongside whatever Phase 2/3 work is current, the same way this project already treats small
> fixes in other modules.
>
> **2. Phase 4's milestone remains the checkpoint for the admin panel's _substantial_ scope** —
> the Artisan/Ustaad Module (approval workflow, document repository, police verification,
> service-area, bank details — [0035](0035-client-feedback-triage-2026-10-18.md) item #2) and
> Reward Tracking. These are large enough, and distinct enough from "admin panel" as a UI
> surface, that they still wait for deliberate Phase 4 scoping and sequencing rather than being
> absorbed piecemeal.
>
> **3. The test for "build it now" vs. "wait for Phase 4": does it need new domain concepts, or
> does it surface/adjust data that already exists?** A last-login timestamp (new column, two
> write points, one read-path exposure) and a dashboard panel listing pending approvals (reads
> data the stats endpoint already computes) both pass this test. An Ustaad document-upload +
> police-verification workflow does not — it needs new domain concepts (document storage,
> verification state, a new approval sub-workflow) that don't exist anywhere in this codebase
> yet.

## Why

The user's own framing — "we are now building admin panel as on the go instead of in the
planned phase" — describes a fact about how this project is actually being run, not a proposal
to evaluate. The job here is to make the written record match that fact and give it a usable
rule, not to argue for reverting to the original phase gate. Rule 3's test (new domain concepts
vs. surfacing existing data) is the same distinction [0034](0034-phase-3-ordering-domain-completion.md)
used to decide the admin-API gap was Phase 3 scope, not Phase 4: the question is never "which
heading does this fall under," it's "how much new design and risk does this actually carry."

## Consequences

- [0035](0035-client-feedback-triage-2026-10-18.md)'s disposition for items #3 (last-login) and
  #5 (pending-approvals view) is superseded by this record: both move from "out of scope,
  deferred to Phase 4" to "in scope, build now." Items #2 (Ustaad approval) and the reward-
  tracking half of Phase 4 are unaffected — still deferred, per rule 2.
- Future small admin asks get judged against rule 3 directly, rather than reopening a "is this
  Phase 4" conversation each time.
- This does not change Phase 4's milestone payment or its remaining substantial scope — it
  narrows what counts as "Phase 4 work" rather than eliminating the phase.

## Open questions

- None at the time of writing. If "incremental admin work" starts accumulating into something
  that materially overlaps Phase 4's planned milestone scope, that's worth a future check-in on
  whether the milestone structure itself needs revisiting — not predicted or pre-decided here.
