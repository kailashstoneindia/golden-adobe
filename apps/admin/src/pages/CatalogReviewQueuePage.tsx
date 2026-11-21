import { useState } from 'react';
import { isEmpty } from 'lodash';
import type { ReviewQueueItem } from '@golden-abode/types';

import { CreateFromRowDialog } from '@/components/catalog/CreateFromRowDialog';
import {
  useLinkReviewRowMutation,
  useRejectReviewRowMutation,
  useReviewQueueQuery,
} from '@/queries/useCatalogQueries';
import styles from '@/styles/shared.module.css';
import catalogStyles from '@/styles/catalog.module.css';

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

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function CatalogReviewQueuePage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const queueQuery = useReviewQueueQuery();
  const linkMutation = useLinkReviewRowMutation();
  const rejectMutation = useRejectReviewRowMutation();

  const rows: ReviewQueueItem[] = queueQuery.data ?? [];
  const isSubmitting = linkMutation.isPending || rejectMutation.isPending;

  const handleLink = async (importRowId: string, masterProductId: string) => {
    setError(null);
    setMessage(null);
    try {
      await linkMutation.mutateAsync({ importRowId, masterProductId });
      setExpandedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link this row.');
    }
  };

  const handleReject = async (importRowId: string) => {
    setError(null);
    setMessage(null);
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
      {message ? <p className={styles.hint}>{message}</p> : null}

      {isEmpty(rows) ? (
        <div className={styles.empty}>
          Nothing waiting for review. Rows land here when a vendor upload cannot be matched
          confidently to an existing product.
        </div>
      ) : (
        <div className={styles.grid}>
          {rows.map((row) => {
            const isExpanded = expandedId === row.importRowId;
            const productName = row.rawRow?.productName ? String(row.rawRow.productName) : null;
            return (
              <div key={row.importRowId} className={catalogStyles.reviewCard}>
                <button
                  type="button"
                  className={styles.collapsibleTrigger}
                  onClick={() => setExpandedId(isExpanded ? null : row.importRowId)}
                >
                  <span>
                    <strong>{String(row.rawRow?.productRef ?? 'Unnamed row')}</strong>
                    {productName ? ` · ${productName}` : ''}
                    <span className={catalogStyles.attrMeta}>
                      {` ${row.vendorName} · ${plural(row.candidates.length, 'candidate')}`}
                    </span>
                  </span>
                  <span className={styles.collapsibleChevron}>{isExpanded ? '▾' : '▸'}</span>
                </button>

                {isExpanded ? (
                  <div className={styles.collapsibleBody}>
                    <h4 className={catalogStyles.detailTitle}>What the vendor sent</h4>
                    <RawRow raw={row.rawRow} />

                    <h4 className={catalogStyles.detailTitle}>Candidates</h4>
                    {isEmpty(row.candidates) ? (
                      <div className={styles.sectionEmpty}>
                        No existing product matches. If the product is new, create it from this row:
                        the vendor&apos;s details are filled in, and the row is linked to it.
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={styles.buttonPrimary}
                            onClick={() => setCreatingId(row.importRowId)}
                          >
                            Create product from this row
                          </button>
                        </div>
                      </div>
                    ) : (
                      <ul className={catalogStyles.attrList}>
                        {row.candidates.map((candidate) => (
                          <li key={candidate.masterProductId} className={catalogStyles.attrItem}>
                            <div className={catalogStyles.attrHead}>
                              <strong>{candidate.productName}</strong>
                              <span className={catalogStyles.badgeVariant}>
                                {Math.round(candidate.score * 100)}%
                              </span>
                            </div>
                            <div className={catalogStyles.attrMeta}>
                              {candidate.productCode ? <code>{candidate.productCode}</code> : null}
                              {candidate.matchedOn ? ` · matched on ${candidate.matchedOn}` : ''}
                            </div>
                            <button
                              type="button"
                              className={styles.buttonPrimary}
                              disabled={isSubmitting}
                              onClick={() => handleLink(row.importRowId, candidate.masterProductId)}
                            >
                              Link to this product
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {rejectingId === row.importRowId ? (
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
                            onClick={() => handleReject(row.importRowId)}
                          >
                            Confirm reject
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.buttonDanger}
                        onClick={() => setRejectingId(row.importRowId)}
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

      {creatingId ? (
        <CreateFromRowDialog
          importRowId={creatingId}
          onDone={(done) => {
            setMessage(done);
            setCreatingId(null);
            setExpandedId(null);
          }}
          onClose={() => setCreatingId(null)}
        />
      ) : null}
    </section>
  );
}
