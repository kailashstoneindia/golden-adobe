# S11: Wrap-up

Needs S1-S10. Do **not** merge or deploy; ask the user which merge method first.

## Task 1: End-to-end browser check
- [ ] **Step 1:** Run backend (compiled to a temp folder, spare port) and admin against `golden_abode_test`, with the BullMQ worker active.
- [ ] **Step 2:** With Playwright walk the whole onboarding as client staff would: add a brand (form, logo, alias) → add one product with an image and publish →
  try to publish one with no image (refused) → import a six-row sheet in the background (one unknown brand, one bad enum) → watch progress, download rejected rows, fix and re-upload →
  add the missing brand and import the rest → bulk-upload images by product code → publish by brand → create a deliberate duplicate and merge it (with a vendor listing on both, using seeded rows) →
  retire a product → undo an import. Screenshot each step into the scratchpad.
- [ ] **Step 3:** Fix defects in the owning session's files (not here), re-run the affected specs, then the full backend and admin suites and both typechecks. Expected: all green.
- [ ] **Step 4:** Remove every seeded row, stop the servers, delete the temp build.

## Task 2: Documentation
- [ ] **Step 1:** Set decision 0062 Status to `Implemented (pending merge)`, 0061 to `Superseded by 0062`, and update both rows in `docs/decisions/README.md`.
- [ ] **Step 2:** Add a short "Onboarding a brand and its products" how-to for the client's staff to `docs/` (screens in order, what each error means, how to fix a mistake). Keep it to one page with the screens' real names.
- [ ] **Step 3:** Update `docs/order-flow.md` or the API docs only where a documented endpoint changed (the import endpoint now returns `202 { jobId }`).
- [ ] **Step 4:** Tick S11 in `00-README.md`. **Commit** `Catalog: docs and decision status (decision 0062)`.

## Task 3: Hand-off note to the user
- [ ] Report what shipped, any call in decision 0062 that changed during the build, the open items (senior-admin role, brand spreadsheet import, client confirming images), and the pre-live
  checklist (migration on production through the usual SSM path, which needs the user's permission; confirm Redis is available for the import worker on the AWS box).
