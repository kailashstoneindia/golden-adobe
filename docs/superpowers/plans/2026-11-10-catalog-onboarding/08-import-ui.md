# S8: Import screen (admin UI)

Needs S7. Rewrites `pages/CatalogImportPage.tsx` (keep its category picker and template download), `queries/useCatalogQueries.ts`
(`useUploadImportMutation`), `services/api/catalogService.ts`, `types/catalog.types.ts` (replace the old `ImportResult`).
Browser-check at the end.

**Produces:** `catalogService.uploadImport(categoryId, file): Promise<{ jobId: string }>`, `listImportJobs(page)`, `getImportJob(id)`,
`getImportErrorUrl(id)`, `undoImportJob(id)`; hooks `useUploadImportMutation`, `useImportJobsQuery(page)`,
`useImportJobQuery(id)` (refetches every 2000 ms while status is `queued`/`running`), `useUndoImportMutation`.

## Task 1: Upload starts a job and shows progress
- [ ] **Step 1: Failing tests** (`CatalogImportPage.spec.tsx`): after uploading, the page shows "Import started" and a progress row ("120 of 400 rows") that updates as the mocked
  job query changes from `running` to `done`; the finished row shows **accepted and rejected counts** (fixes the blank summary); a `failed` job shows its `failureMessage`;
  an over-size file shows the server's 413 message.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run.** PASS. **Step 5: Commit** `Catalog: import progress screen (decision 0062)`.

## Task 2: History, rejected rows, undo
- [ ] **Step 1: Failing tests:** a "Past imports" table lists category, who, when, counts and status; jobs with rejected rows show "Download rejected rows" (calls `getImportErrorUrl`
  and opens the URL); "Undo" asks for confirmation ("Deletes N draft products from this import; products that already have listings are kept"), calls undo and shows
  "Deleted X, kept Y"; an undone job shows "Undone"; the empty state explains where imports will appear.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run** the full admin suite + `tsc --noEmit`. PASS.
- [ ] **Step 5: Browser check** (Playwright, local test DB, backend running the worker): upload a six-row file with one unknown brand; watch progress; download rejected rows;
  fix and re-upload only those rows; undo the first job. Clean up. **Commit** `Catalog: import history, errors, undo (decision 0062)`; tick S8.
