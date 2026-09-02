import { useState } from 'react';
import { isEmpty } from 'lodash';

import {
  useLinkReviewRowMutation,
  useRejectReviewRowMutation,
  useReviewQueueQuery,
} from '@/queries/useCatalogQueries';
import styles from '@/styles/shared.module.css';
import catalogStyles from '@/styles/catalog.module.css';
import type { ReviewQueueRow } from '@/types/catalog.types';

// Renders whatever the vendor actually typed. The row is free-form by design
// (decision 0011: a vendor identifies a product however they already do —
// barcode, part number, or a plain name), so the shape is not fixed.
function RawRow({ raw }: { raw: Record<string, unknown> }) {
  const entries = Object.entries(raw ?? {}).filter(
    ([, value]) => value !== null && value !== undefined && value !== '',
  );
  if (isEmpty(entries)) return <span className={styles.detailValue}>—</span>;
  return (
    <div className={styles.detailSections}>
      {entries.map(([key, value]) => (
        <div key={key} className={styles.detailRow}>
          <span className={styles.detailLabel}>{key}</span>
          <span className={styles.detailValue}>{String(value)}</span>
        </div>
      ))}
    </div>
  );
}

export function CatalogReviewQueuePage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const queueQuery = useReviewQueueQuery();
  const linkMutation = useLinkReviewRowMutation();
  const rejectMutation = useRejectReviewRowMutation();

  const rows: ReviewQueueRow[] = queueQuery.data ?? [];
  const isSubmitting = linkMutation.isPending || rejectMutation.isPending;

  const handleLink = async (importRowId: string, masterProductId: string) => {
    setError(null);
    try {
      await linkMutation.mutateAsync({ importRowId, masterProductId });
      setExpandedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link this row.');
    }
  };

  const handleReject = async (importRowId: string) => {
    setError(null);
    try {
      await rejectMutation.mutateAsync({
        importRowId,
        reason: rejectReason || 'Rejected by admin',
      });
      setRejectingId(null);
      setRejectReason('');
      setExpandedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject this row.');
    }
  };

  if (queueQuery.isLoading) {
    return <p className={styles.pageSubtitle}>Loading review queue…</p>;
  }
  if (queueQuery.isError) {
    return <p className={styles.error}>Could not load the review queue.</p>;
  }

  return (
    <section>
      <h2 className={styles.pageTitle}>Review queue</h2>
      <p className={styles.pageSubtitle}>
        Vendor upload rows the matcher could not resolve confidently. Candidates are ranked, never
        auto-applied — linking writes a mapping so the same vendor SKU matches itself next time.
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}

      {isEmpty(rows) ? (
        <div className={styles.empty}>
          Nothing waiting for review. Rows land here when a vendor upload cannot be matched
          confidently to an existing product.
        </div>
      ) : (
        <div className={styles.grid}>
          {rows.map((row) => {
            const isExpanded = expandedId === row.id;
            return (
              <div key={row.id} className={catalogStyles.reviewCard}>
                <button
                  type="button"
                  className={styles.collapsibleTrigger}
                  onClick={() => setExpandedId(isExpanded ? null : row.id)}
                >
                  <span>
                    <strong>{String(row.rawRowJson?.productRef ?? 'Unnamed row')}</strong>
                    <span className={catalogStyles.attrMeta}>
                      {row.matchCandidates.length} candidate
                      {row.matchCandidates.length === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className={styles.collapsibleChevron}>{isExpanded ? '▾' : '▸'}</span>
                </button>

                {isExpanded ? (
                  <div className={styles.collapsibleBody}>
                    <h4 className={catalogStyles.detailTitle}>What the vendor sent</h4>
                    <RawRow raw={row.rawRowJson} />

                    <h4 className={catalogStyles.detailTitle}>Candidates</h4>
                    {isEmpty(row.matchCandidates) ? (
                      <div className={styles.sectionEmpty}>
                        No candidates were found. This is effectively a request for a new product —
                        reject it here, and add the product through import.
                      </div>
                    ) : (
                      <ul className={catalogStyles.attrList}>
                        {row.matchCandidates.map((candidate) => (
                          <li key={candidate.masterProductId} className={catalogStyles.attrItem}>
                            <div className={catalogStyles.attrHead}>
                              <strong>{candidate.productName ?? candidate.masterProductId}</strong>
                              <span className={catalogStyles.badgeVariant}>
                                {Math.round((candidate.score ?? 0) * 100)}%
                              </span>
                            </div>
                            <div className={catalogStyles.attrMeta}>
                              {candidate.productCode ? <code>{candidate.productCode}</code> : null}
                              {candidate.method ? ` · matched on ${candidate.method}` : ''}
                            </div>
                            <button
                              type="button"
                              className={styles.buttonPrimary}
                              disabled={isSubmitting}
                              onClick={() => handleLink(row.id, candidate.masterProductId)}
                            >
                              Link to this product
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {rejectingId === row.id ? (
                      <div className={catalogStyles.stepCard}>
                        <input
                          className={styles.input}
                          placeholder="Reason (optional)"
                          value={rejectReason}
                          onChange={(event) => setRejectReason(event.target.value)}
                        />
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={styles.buttonGhost}
                            onClick={() => setRejectingId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className={styles.buttonDanger}
                            disabled={isSubmitting}
                            onClick={() => handleReject(row.id)}
                          >
                            Confirm reject
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.buttonDanger}
                        onClick={() => setRejectingId(row.id)}
                      >
                        Reject row
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
