import { useProductReadinessQuery } from '@/queries/useCatalogQueries';
import styles from '@/styles/shared.module.css';

// What a product still needs before it can go live (decision 0063): a tick
// for each met check, a red cross for a missing blocking one, and an amber
// warning for one that does not stop publishing.
export function ReadinessChecklist({ productId }: { productId: string }) {
  const readiness = useProductReadinessQuery(productId);

  if (readiness.isLoading) return <p className={styles.hint}>Checking readiness…</p>;
  if (!readiness.data) return <p className={styles.error}>Could not check readiness.</p>;

  return (
    <ul aria-label="Readiness" className={styles.checklist}>
      {readiness.data.checks.map((check) => {
        const state = check.passed ? 'ok' : check.blocking ? 'blocking' : 'warning';
        return (
          <li key={check.code} className={styles[`check_${state}`]} data-state={state}>
            <span aria-hidden="true">{check.passed ? '✓' : check.blocking ? '✗' : '!'}</span>
            <span>
              {check.label}
              {check.passed ? '' : state === 'warning' ? ' (warning)' : ' (required)'}
              {check.detail && !check.passed ? `: ${check.detail}` : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// True when a blocking check fails, so Publish stays disabled.
export function useHasBlockingGap(productId: string | null): boolean {
  const readiness = useProductReadinessQuery(productId);
  if (!readiness.data) return true;
  return readiness.data.checks.some((check) => check.blocking && !check.passed);
}
