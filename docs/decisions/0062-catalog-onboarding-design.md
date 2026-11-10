# 0062 — Admin brand and product onboarding: design

- **Date:** 2026-11-10
- **Status:** Draft — design agreed with the user, nothing built
- **Supersedes / Superseded by:** Follows up the findings in [0061](0061-catalog-onboarding-review.md)

## Context

[0061](0061-catalog-onboarding-review.md) found twelve gaps in the admin brand and product onboarding
flow. The user wants it fixed completely. The business is an ecommerce marketplace: the platform owns the
brand and product catalog; vendors only bring their own inventory and prices. Eventually the client's own staff,
who are not technical, will do the onboarding. They hold product and brand information from the vendors they
plan to onboard, and they start small.

## Decisions

| # | Question | Answer | Source |
|---|---|---|---|
| 1 | Who onboards? | The client's staff, eventually. Screens must be forgiving. | User |
| 2 | Import size | Unknown, small at first. **Imports run in the background.** | User |
| 3 | Where does brand data come from? | The client holds it. Nothing arrives from brands. Brands are entered by form. | User |
| 4 | Brand vs vendor | The platform controls brands and products only. Vendors onboard their own inventory. No admin-created vendors. | User |
| 5 | What must a product have to go live? | **At least one image** and the category's required attributes. A missing **HSN code is only a warning**, not a blocker, until invoices exist. No vendor listing is needed. | User (image); HSN agreed 2026-11-10 |
| 6 | Fixing mistakes | Admin can **edit** brands and products and **merge** a duplicate into the right one. | User |
| 7 | Merge conflict: the same vendor sells both duplicates | The listing on the correct product stays. The other is **paused** and shown to the admin. Nothing is deleted. | User |
| 8 | Brand entry method | **Form only** for now. No Excel import for brands. | User |
| 9 | Staff permissions (who may merge or retire) | **Later.** Any admin can for now. | User |

## What will be built

Details in [the spec](../superpowers/specs/2026-11-10-catalog-onboarding-design.md).

- A **Brands** page: add, edit, deactivate, logo, spelling aliases, merge.
- Brand names resolved through the existing resolver everywhere, so `HAVELLS` and `havells ltd` match.
- An **add-product form** with image upload, and editing of every field except category.
- **Retire** a product, **delete** an unused draft, **merge** a duplicate into the right product.
- A **readiness checklist** per product. Publishing enforces the blocking checks on the server.
- **HSN codes**: a picker, a way to add missing HSN codes, and a **default HSN per category** that fills in new
  products (imports included).
- **Background imports** with a history page, progress, a downloadable file of rejected rows, and undo.
- A brand filter on the products list, and publish by brand.
- "Create product from this row" in the vendor review queue.
- Bulk image upload matched by product code, or by brand and part number (product codes are only created at import,
  so staff can't name files by code beforehand).

## My calls (not yet confirmed by the user)

- HSN is a warning, not a blocker. Evidence (checked 2026-11-10): 235 of 645 real products in the local catalog have no
  HSN code, mostly sanitaryware; decision 0026 found only one of four Pearl Precision catalogs printed HSN codes; the
  backend has no invoice code that uses it; GST rate is already required on every product; the
  `category.hsn_code_default` column exists but is empty for all leaf categories and nothing reads it. In law every good
  has an HSN and a GST invoice must carry 4 digits (turnover up to ₹5 crore) or 6 digits (above), per Notification
  78/2020-Central Tax. Make it blocking when invoicing is built. The client's accountant should confirm the rules.
- No HSN codes are pre-loaded by me. Only 26 codes are in the table (none for taps or most sanitaryware) and I won't
  invent GST rates. Staff add missing codes and rates through the admin screen.
- The category of a product can't be edited. A product in the wrong category is retired and re-created, because
  attribute values belong to the category.
- Product merge requires the same category on both products.
- Retiring a product pauses its active vendor listings, so nothing retired can be bought.
- Deleting is allowed only for drafts with no listings, no orders and no import-row links.
- Import file size is capped at 20 MB to protect memory. Row count is not capped.
- Merges leave a log row (who, what, when) and keep a `merged_into_id` pointer on the retired record.
- Product slugs stay the same when a product is renamed, so links don't break.
- Images are not copied during a merge unless the target has none.

## Consequences

- Several new columns and two new tables (see the spec). Old data needs no backfill.
- The synchronous import endpoint is replaced by a background job. The admin import screen changes.
- `apps/mobile` is untouched. The customer app only sees fewer broken or incomplete products.

## Open questions

| Item | Notes |
|---|---|
| Senior admin role for merge and retire | Deferred by the user. Merge and retire are logged now so this can be added later. |
| Brand import by spreadsheet | Deferred. Revisit if the client brings many brands at once. |
| What counts as "required attributes" for publishing | Same rule the import template uses for starred columns. Confirm with the client's staff once they use it. |
| HSN as a publish blocker | Turn on when invoice generation exists. Needs real category defaults first, supplied by the client's accountant. |
| Images supplied by the client | Needs the client to confirm they will have at least one image per product. |

## Sources

- [0061](0061-catalog-onboarding-review.md), [0010](0010-indian-compliance-fields.md),
  [0026](0026-pearl-precision-brand-onboarding.md), [0027](0027-lavish-ceramics-brand-onboarding.md),
  [0023](0023-single-product-create-edit.md)
