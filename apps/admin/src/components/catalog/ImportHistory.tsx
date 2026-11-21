import { useState } from 'react';
import type { CatalogImportJobDto } from '@golden-abode/types';

import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useImportJobsQuery, useUndoImportMutation } from '@/queries/useCatalogQueries';
import { ApiClientError, catalogService } from '@/services';
import styles from '@/styles/shared.module.css';
import catalogStyles from '@/styles/catalog.module.css';
import { formatDateTime } from '@/utils/date';

const STATUS_LABELS: Record<CatalogImportJobDto['status'], string> = {
  queued: 'Waiting',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
};

const messageOf = (error: unknown, fallback: string) =>
  error instanceof ApiClientError ? error.message : fallback;

// Decision 0063: every import with who ran it, its counts, the rejected rows
// to fix and re-upload, and an undo for a mistaken file.
export function ImportHistory() {
  const jobsQuery = useImportJobsQuery(1);
  const undo = useUndoImportMutation();
  const [confirming, setConfirming] = useState<CatalogImportJobDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const jobs = jobsQuery.data?.items ?? [];

  const download = async (jobId: string) => {
    setError(null);
    try {
      const { url } = await catalogService.getImportErrorUrl(jobId);
      window.open(url, '_blank');
    } catch (caught) {
      setError(messageOf(caught, 'Could not get the rejected rows'));
    }
  };

  const runUndo = async () => {
    if (!confirming) return;
    setError(null);
    try {
      const result = await undo.mutateAsync(confirming.id);
      setMessage(`Deleted ${result.deleted}, kept ${result.kept}.`);
      setConfirming(null);
    } catch (caught) {
      setError(messageOf(caught, 'Could not undo the import'));
    }
  };

  return (
    <div className={catalogStyles.stepCard}>
      <h3 className={catalogStyles.stepTitle}>Past imports</h3>
      {message ? <p className={styles.hint}>{message}</p> : null}
      {error && !confirming ? <p className={styles.error}>{error}</p> : null}
      {jobsQuery.isLoading ? (
        <p className={styles.hint}>Loading…</p>
      ) : jobs.length === 0 ? (
        <div className={styles.sectionEmpty}>
          No imports yet. Each upload appears here with its progress, results and an undo.
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Past imports">
            <thead>
              <tr>
                <th>Category</th>
                <th>By</th>
                <th>Started</th>
                <th>Rows</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const finished = job.status === 'done' || job.status === 'failed';
                return (
                  <tr key={job.id}>
                    <td className={catalogStyles.pathCell}>{job.categoryPath}</td>
                    <td>{job.createdByName}</td>
                    <td>{formatDateTime(job.createdAt)}</td>
                    <td>
                      {finished
                        ? `${job.acceptedCount} accepted, ${job.rejectedCount} rejected`
                        : `${job.processedRows} of ${job.totalRows}`}
                    </td>
                    <td>
                      <span className={styles.badge}>
                        {job.undone ? 'Undone' : STATUS_LABELS[job.status]}
                      </span>
                      {job.status === 'failed' && job.failureMessage ? (
                        <span className={styles.hint}> {job.failureMessage}</span>
                      ) : null}
                    </td>
                    <td>
                      <div className={styles.inlineForm}>
                        {job.hasErrorFile ? (
                          <button
                            type="button"
                            className={`${styles.button} ${styles.buttonGhost}`}
                            onClick={() => void download(job.id)}
                          >
                            Download rejected rows
                          </button>
                        ) : null}
                        {finished && !job.undone ? (
                          <button
                            type="button"
                            className={`${styles.button} ${styles.buttonGhost}`}
                            onClick={() => setConfirming(job)}
                          >
                            Undo
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirming ? (
        <ConfirmDialog
          title="Undo this import?"
          message={`Deletes ${confirming.acceptedCount} draft products from this import; products that already have listings are kept.`}
          confirmLabel="Undo import"
          busy={undo.isPending}
          error={error}
          onConfirm={() => void runUndo()}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </div>
  );
}
