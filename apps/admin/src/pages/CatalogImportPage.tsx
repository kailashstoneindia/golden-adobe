import { useMemo, useRef, useState } from 'react';
import { isEmpty } from 'lodash';

import { catalogService } from '@/services';
import { useCategoryTreeQuery, useUploadImportMutation } from '@/queries/useCatalogQueries';
import styles from '@/styles/shared.module.css';
import catalogStyles from '@/styles/catalog.module.css';
import type { CategoryNode, ImportResult } from '@/types/catalog.types';

// Only leaves — a product cannot attach to a group category, so offering one
// would produce a template nothing could use.
function leavesOf(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => (node.isLeaf ? [node] : leavesOf(node.children)));
}

export function CatalogImportPage() {
  const [categoryId, setCategoryId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const treeQuery = useCategoryTreeQuery();
  const uploadMutation = useUploadImportMutation();

  const leaves = useMemo(() => leavesOf(treeQuery.data ?? []), [treeQuery.data]);
  const selected = leaves.find((leaf) => leaf.id === categoryId) ?? null;

  const handleDownload = async () => {
    if (!selected) return;
    setError(null);
    setIsDownloading(true);
    try {
      await catalogService.downloadTemplate(selected.id, selected.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the template.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleUpload = async () => {
    if (!selected || !file) return;
    setError(null);
    setResult(null);
    try {
      const uploadResult = await uploadMutation.mutateAsync({ categoryId: selected.id, file });
      setResult(uploadResult);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  };

  return (
    <section>
      <h2 className={styles.pageTitle}>Import products</h2>
      <p className={styles.pageSubtitle}>
        Templates are generated per category from the attribute model — nobody maintains 58
        spreadsheets by hand. Accepted rows land as <strong>drafts</strong>; publishing is a
        separate, deliberate step.
      </p>

      <div className={catalogStyles.stepCard}>
        <h3 className={catalogStyles.stepTitle}>1 · Choose a category</h3>
        <p className={styles.hint}>Leaf categories only — a product cannot belong to a group.</p>
        <select
          className={styles.input}
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setResult(null);
            setError(null);
          }}
        >
          <option value="">Select a category…</option>
          {leaves.map((leaf) => (
            <option key={leaf.id} value={leaf.id}>
              {leaf.path}
            </option>
          ))}
        </select>
      </div>

      <div className={catalogStyles.stepCard}>
        <h3 className={catalogStyles.stepTitle}>2 · Download the template</h3>
        <p className={styles.hint}>
          Columns are that category&apos;s effective attribute set — its own, everything inherited,
          and the global fields. Required columns are starred; enum fields have dropdowns.
        </p>
        <button
          type="button"
          className={styles.buttonPrimary}
          disabled={!selected || isDownloading}
          onClick={handleDownload}
        >
          {isDownloading ? 'Preparing…' : 'Download .xlsx template'}
        </button>
      </div>

      <div className={catalogStyles.stepCard}>
        <h3 className={catalogStyles.stepTitle}>3 · Upload the filled template</h3>
        <p className={styles.hint}>
          Every row is validated — required fields, enum values, numeric parsing, brand resolution
          and duplicate detection. Nothing is written for a row that fails.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className={styles.input}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className={styles.buttonPrimary}
          disabled={!selected || !file || uploadMutation.isPending}
          onClick={handleUpload}
        >
          {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {result ? (
        <div className={catalogStyles.stepCard}>
          <h3 className={catalogStyles.stepTitle}>Result</h3>
          <p className={styles.detailValue}>
            <strong>{result.createdCount}</strong> draft product
            {result.createdCount === 1 ? '' : 's'} created
            {result.errorCount > 0 ? `, ${result.errorCount} row(s) rejected` : ''}.
          </p>

          {!isEmpty(result.errors) ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Column</th>
                    <th>Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((rowError, index) => (
                    <tr key={`${rowError.row}-${rowError.column ?? index}`}>
                      <td>{rowError.row}</td>
                      <td>{rowError.column ?? '—'}</td>
                      <td>{rowError.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.sectionEmpty}>Every row was accepted.</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
