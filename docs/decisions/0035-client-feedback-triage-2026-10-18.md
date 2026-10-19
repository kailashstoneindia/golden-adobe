# 0035 — Client feedback (2026-10-18): phase triage and out-of-scope items

- **Date:** 2026-10-19
- **Status:** Accepted
- **Supersedes / Superseded by:** —

## Context

Two client contacts sent overlapping feedback via WhatsApp on 2026-10-18 covering five
requested changes and two questions. None of it was scoped against the signed proposal
(`Golden Abode – Home Finishing Marketplace Platform.pdf`) before reaching engineering. This
record sorts each point against the proposal's five phases so none of it is silently absorbed
into whichever phase happens to be open (`main` = Phase 2 merged, the unmerged worktree branch
`worktree-phase-3-ordering-domain` = Phase 3 in flight), following the same reasoning that
worktree's own decision record **0034 — "Phase 3 ordering domain: merge plan, admin-API gap,
client-decision dependencies"** used for its admin-API gap: new information discovered mid-phase
gets scoped explicitly, not folded wholesale into whatever phase is most convenient.

**Numbering note:** that record is numbered `0034` on the Phase 3 worktree, where 0032/0033 are
already taken by that branch's own cart/order-structure records. On `origin/main` as of this
branch, `0032` and `0033` are unrelated, already-accepted records (AWS cost minimization; S3
product media), and no `0034` exists at all yet — the worktree's 0034 has not been ported
forward. This record is **not** renumbering anything; it just flags that any link to "0034" in
this family of records (this file, 0036, 0037) means the worktree's record, reachable today
only by checking out `worktree-phase-3-ordering-domain`, not a file in this branch's
`docs/decisions/`. Whoever merges the Phase 3 worktree should follow 0034's own closing note
and renumber its ported 0032/0033-equivalents (and itself) around whatever is free on `main` at
that time — likely 0038+ given this branch's own 0035–0037.

The signed proposal's phases:

- **Phase 2 – Marketplace Core** (Week 3–5): Product Management, Vendor Module, Product
  Catalog, Categories, Search, Inventory Management. **Status: merged to `main`.**
- **Phase 3 – Cart, Orders & Payments** (Week 6–8): Cart Management, Checkout Flow, Razorpay,
  Order Management, Notifications. **Status: built and reviewed in the unmerged worktree
  `worktree-phase-3-ordering-domain`**, per that worktree's own 0034 (see numbering note above).
- **Phase 4 – Artisan Rewards & Admin Panel** (Week 9–10): Artisan Module, Reward Tracking,
  Admin Dashboard, User Management, Product Moderation. **Status: not started.**
- **Phase 5 – QA, Deployment & Launch** (Week 11–12).

## Client feedback, sorted

| # | Client point | Phase | Disposition |
|---|---|---|---|
| 1 | Rename category "Sanitaryware & Bath" → "Bath and Sanitaryware" | Phase 2 | In scope, trivial — see Decision. |
| 1b | Possible retaxonomy into "Sanitary & Plumbing" / "Hardware & Tools" | Phase 2 | Ambiguous — needs client confirmation before touching the category tree; not actioned yet. |
| 2 | Ustaad approval: Aadhaar upload, police verification, service-area field, bank details, bio-only visibility to customers | **Out of scope** | Belongs to Phase 4's Artisan Module, which has not started. None of it exists in Phase 2 or Phase 3 code. |
| 3 | "Last login" timestamp on All Users | **Out of scope** | Belongs to Phase 4's Admin Dashboard / User Management. |
| 4 | Delivery module: drivers, co-drivers, an onboarding dashboard for drivers and an operations role that inspects orders in transit | **Out of scope — and not in the original proposal at all** | Order Management (Phase 3) covers order status/tracking, not an in-house delivery fleet with its own roles and onboarding UI. This was never scoped in any of the five phases — closer to the "Smart Delivery Routing" line explicitly excluded from MVP. Needs its own estimate, not quiet absorption into Phase 3 or Phase 4. |
| 5 | Dashboard: show pending-approvals count instead of generic Review buttons | **Out of scope** | Admin Dashboard is Phase 4. |
| Q1 | "Why can't I edit anything in the admin panel?" | Not a phase item | Reads as a bug or missing permission on existing Phase 2/3 admin screens, not a new feature. Needs reproduction before it's scoped anywhere. |
| Q2 | Who loads/unloads tiles at delivery; vendor capability + checkout charge | Split: Phase 2 (vendor field) + Phase 3 (checkout charge) | In scope — see [0036](0036-vendor-loading-unloading-capability.md) for the design. |

## Decision

> **Phase 2 work to do now:** #1 (category rename) and the vendor half of Q2 (loading/unloading
> capability field — designed separately in 0036).
>
> **Phase 3 work to do now:** the checkout half of Q2 (loading/unloading charge line item — also
> in 0036).
>
> **Everything else in the table (#2, #3, #4, #5, 1b, Q1) is explicitly out of scope for the
> current Phase 2/Phase 3 work** and is not actioned by this record. #2, #3, #5 are legitimate
> future work but belong to Phase 4, which has not started and has its own milestone payment
> and timeline in the signed proposal. #4 is new scope not contemplated by any phase and needs
> its own estimate before anyone commits to it. 1b and Q1 need a client answer / bug repro
> before they can be scoped at all.

## Why

Phase boundaries in the signed proposal are tied to milestone payments (₹40,000 each). Treating
Phase 4 features as if they were small Phase 2/3 additions — because they arrived in the same
WhatsApp message as a one-line category rename — would quietly expand Phase 2/3's delivery
without the client having agreed to re-scope those milestones. The same risk the Phase 3
worktree's 0034 flagged for the admin-API gap applies here in the other direction: undercounting
new scope by assuming it fits inside work already priced and underway.

## Consequences

- This record is the reference point if the client asks "did you see point 2/3/4/5" — the
  answer is yes, triaged, and intentionally not started, not missed.
- A client-facing message is still owed: confirming #1 will ship, flagging 1b as needing a
  decision, flagging Q1 for reproduction, and naming #2/#3/#4/#5 as Phase 4 (or new-scope, for
  #4) rather than silently going quiet on them.
- No code changes happen here for #2, #3, #4, #5, 1b, or Q1.

## Open questions

- Whether #4 (delivery module) gets estimated as an extension of Phase 4 or as a distinct
  Phase 6 — not decided here; needs a client conversation about cost and timeline first.
- Whether 1b is a rename (replace one category) or a taxonomy split (two new categories
  replacing one) — ambiguous in the client's own message, needs a direct question back to them.
- Q1's root cause (permission bug vs. intentional read-only state) — not diagnosed here.
