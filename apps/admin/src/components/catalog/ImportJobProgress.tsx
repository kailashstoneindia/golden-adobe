import type { CatalogImportJobDto } from '@golden-abode/types';

import { useImportJobQuery } from '@/queries/useCatalogQueries';
import styles from '@/styles/shared.module.css';
import catalogStyles from '@/styles/catalog.module.css';

// One sentence for where an import stands (decision 0063).
export function describeImportJob(job: CatalogImportJobDto): string {
  switch (job.status) {
    case 'queued':
      return 'Waiting to start…';
    case 'running':
      return `${job.processedRows} of ${job.totalRows} rows`;
    case 'done':
      return `Done: ${job.acceptedCount} accepted, ${job.rejectedCount} rejected`;
    case 'failed':
      return `Failed: ${job.failureMessage ?? 'unknown error'}`;
  }
}

// The import just started from this page, refreshed every 2 s until it ends.
export function ImportJobProgress({ jobId }: { jobId: string }) {
  const jobQuery = useImportJobQuery(jobId);
  const job = jobQuery.data;
  const fraction = job && job.totalRows > 0 ? job.processedRows / job.totalRows : 0;

  return (
    <div className={catalogStyles.stepCard} aria-live="polite">
      <h3 className={catalogStyles.stepTitle}>Import started</h3>
      {!job ? (
        <p className={styles.hint}>Checking…</p>
      ) : (
        <>
          <p className={job.status === 'failed' ? styles.error : styles.detailValue}>
            {describeImportJob(job)}
          </p>
          {job.status === 'running' || job.status === 'queued' ? (
            <progress
              className={styles.progressBar}
              max={1}
              value={fraction}
              aria-label="Import progress"
            />
          ) : null}
          {job.status === 'done' ? (
            <p className={styles.hint}>
              Accepted rows are now draft products. Rejected rows can be downloaded from the list
              below, fixed and uploaded again on their own.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
