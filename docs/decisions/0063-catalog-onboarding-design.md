# 0063 — Admin brand and product onboarding: design

- **Date:** 2026-11-10
- **Status:** Draft — design agreed with the user, nothing built
- **Supersedes / Superseded by:** Follows up the findings in [0062](0062-catalog-onboarding-review.md)

## Context

[0062](0062-catalog-onboarding-review.md) found twelve gaps in the admin brand and product onboarding
flow. The user wants it fixed completely. The business is an ecommerce marketplace: the platform owns the
brand and product catalog; vendors only bring their own inventory and prices. Eventually the client's own staff,
who are not technical, will do the onboarding. They hold product and brand information from the vendors they
plan to onboard, and they start small.

## Decisions

| #   | Question                                              | Answer                                                                                                                                                                     | Source                              |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | Who onboards?                                         | The client's staff, eventually. Screens must be forgiving.                                                                                                                 | User                                |
| 2   | Import size                                           | Unknown, small at first. **Imports run in the background.**                                                                                                                | User                                |
| 3   | Where does brand data come from?                      | The client holds it. Nothing arrives from brands. Brands are entered by form.                                                                                              | User                                |
| 4   | Brand vs vendor                                       | The platform controls brands and products only. Vendors onboard their own inventory. No admin-created vendors.                                                             | User                                |
| 5   | What must a product have to go live?                  | **At least one image** and the category's required attributes. A missing **HSN code is only a warning**, not a blocker, until invoices exist. No vendor listing is needed. | User (image); HSN agreed 2026-11-10 |
| 6   | Fixing mistakes                                       | Admin can **edit** brands and products and **merge** a duplicate into the right one.                                                                                       | User                                |
| 7   | Merge conflict: the same vendor sells both duplicates | The listing on the correct product stays. The other is **paused** and shown to the admin. Nothing is deleted.                                                              | User                                |
| 8   | Brand entry method                                    | **Form only** for now. No Excel import for brands.                                                                                                                         | User                                |
| 9   | Staff permissions (who may merge or retire)           | **Later.** Any admin can for now.                                                                                                                                          | User                                |

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

## Implementation notes

| Session | Choice                                                                                                                                     | Why                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| S1      | Import job `status` and merge-log `entity_type` are `varchar` with a `CHECK`, not Postgres enums.                                          | Adding a value later is a constraint swap, not an `ALTER TYPE`.                   |
| S1      | The brand resolver follows `merged_into_id` at most 5 hops. A cycle or longer chain returns "not found" and logs an error.                 | A corrupt merge chain can't loop forever.                                         |
| S1      | Removing an alias that belongs to a different brand returns 404.                                                                           | The brands API deletes by `/:brandId/aliases/:aliasId`; the pair must match.      |
| S1      | Import and add-product both say an unknown brand "is not in the catalog. Add it on the Brands page first"; a deactivated brand is refused. | Same wording on both paths, and it points at the screen that will exist after S3. |

### S2 (brands API)

| Choice                                                                                                                                                                        | Why                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new brand's name, a rename, or a new alias is refused (409) if it equals another brand's alias or another brand's normalized name.                                          | The resolver checks aliases before names, so either would silently send one brand's imports to another.                                                                                      |
| Brand logos are stored under `variants/brands/<brandId>/logo-<uuid>.<ext>`, not `brands/<brandId>/…`; `logoUrl` is the full public URL. JPEG, PNG or WebP, 2 MB; SVG refused. | The CDN serves only `variants/*` (`infra/aws/s3/media-bucket-policy.json`), and the media sweep and image Lambda only touch product keys. The spec's key would store a URL that returns 403. |
| A brand's slug never changes on rename.                                                                                                                                       | Same rule as products: links keep working.                                                                                                                                                   |
| Merge locks both brands in id order and refuses (409, nothing moved) if any part number exists under both brands, listing them.                                               | The `(brand_id, mfr_part_number)` unique index would fail mid-merge otherwise.                                                                                                               |
| A merged brand can't be edited or reactivated (400); deactivating it again is a harmless no-op.                                                                               | It only exists so its old name keeps resolving.                                                                                                                                              |

### S3 (Brands page)

| Choice                                                                                                                                                                                                                                                | Why                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `BrandDto.aliases` is `{ id, alias }[]`, not `string[]`.                                                                                                                                                                                              | The screen removes an alias by id (`DELETE /:id/aliases/:aliasId`). |
| The list shows active brands by default; "Show inactive brands" switches to inactive ones, where a merged brand reads "Merged into &lt;name&gt;".                                                                                                     | Pickers and day-to-day work only need active brands.                |
| The form checks the same rules as the API (five required fields, email shape, phone pattern) before sending; edit sends only changed fields.                                                                                                          | Fast feedback, and a save never rewrites untouched data.            |
| Logo upload is checked in the browser too (JPEG, PNG or WebP, 2 MB).                                                                                                                                                                                  | Same limits as the API; no wasted upload.                           |
| Browser-checked on 2026-11-20 against `golden_abode_test` and local MinIO: create, duplicate refused, alias, logo (loads from the public `variants/` URL), merge, and an import row typed with the merged brand's old name landing on the kept brand. | —                                                                   |

### S4 (product API)

| Choice                                                                                                                                                                                                                  | Why                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| The image check counts only images (not spec sheets) that did not fail processing.                                                                                                                                      | Either of those shows the customer nothing.                                                                            |
| The publish refusal names what is missing ("Cannot publish: needs at least one image; Missing: Finish"); bulk publish lists not-ready products under `skipped` with their codes and reasons, without failing the batch. | The admin can fix exactly what is listed.                                                                              |
| A generic product cannot be given a brand; a branded product can move to another active brand but cannot lose its brand.                                                                                                | The database forbids a generic product with a brand; switching between generic and branded is re-creating the product. |
| A retired product cannot be published or unpublished; restore brings it back as a draft, and listings paused by the retire stay paused for their vendors to resume.                                                     | "Never straight to live" from the spec; resuming a listing is the vendor's choice.                                     |
| Delete also refuses a draft with a paused listing, an order line or a matched vendor import row.                                                                                                                        | Those keep a reference to the product.                                                                                 |
| The admin product search matches the brand name too; the shared search clause used by vendors is unchanged.                                                                                                             | "Havells" should list Havells products on the admin screen.                                                            |
| A blank HSN code takes the category default on add-product **and** on import, with that code's GST rate when no rate is given.                                                                                          | The spec covers both entry points.                                                                                     |

## Open questions

| Item                                                | Notes                                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Senior admin role for merge and retire              | Deferred by the user. Merge and retire are logged now so this can be added later.                                |
| Brand import by spreadsheet                         | Deferred. Revisit if the client brings many brands at once.                                                      |
| What counts as "required attributes" for publishing | Same rule the import template uses for starred columns. Confirm with the client's staff once they use it.        |
| HSN as a publish blocker                            | Turn on when invoice generation exists. Needs real category defaults first, supplied by the client's accountant. |
| Images supplied by the client                       | Needs the client to confirm they will have at least one image per product.                                       |

## Sources

- [0062](0062-catalog-onboarding-review.md), [0010](0010-indian-compliance-fields.md),
  [0026](0026-pearl-precision-brand-onboarding.md), [0027](0027-lavish-ceramics-brand-onboarding.md),
  [0023](0023-single-product-create-edit.md)
