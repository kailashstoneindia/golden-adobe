import { useState } from 'react';
import { isEmpty } from 'lodash';
import type { AdminAssignmentDto, DeliveryAssignmentStatus } from '@golden-abode/types';

import { DriverPickerModal } from '@/components/delivery/DriverPickerModal';
import { APP_CONSTANTS } from '@/constants/appConstants';
import {
  DELIVERY_BOARD_TABS,
  DELIVERY_FAILURE_REASON_LABELS,
} from '@/constants/delivery.constants';
import { useAssignmentsQuery, useReassignMutation, useReattemptMutation } from '@/queries';
import styles from '@/styles/shared.module.css';
import { formatDateTime } from '@/utils/date';

type Picking = { kind: 'reassign' | 'reattempt'; assignment: AdminAssignmentDto };

function photoLink(assignment: AdminAssignmentDto): string | null {
  return assignment.status === 'delivered'
    ? assignment.deliveryPhotoViewUrl
    : assignment.status === 'failed'
      ? assignment.failurePhotoViewUrl
      : null;
}

function whenOf(assignment: AdminAssignmentDto): string {
  const at =
    assignment.deliveredAt ?? assignment.failedAt ?? assignment.pickedUpAt ?? assignment.assignedAt;
  return formatDateTime(at);
}

// Decision 0060: every assignment, by where it is in the delivery.
export function DeliveryBoardPage() {
  const [status, setStatus] = useState<DeliveryAssignmentStatus>('assigned');
  const [picking, setPicking] = useState<Picking | null>(null);
  const listQuery = useAssignmentsQuery({
    status,
    page: 1,
    pageSize: APP_CONSTANTS.defaultPageSize,
  });
  const reassign = useReassignMutation();
  const reattempt = useReattemptMutation();

  const rows = listQuery.data?.items ?? [];

  const confirm = (driverId: string) => {
    if (!picking) return Promise.resolve();
    return picking.kind === 'reassign'
      ? reassign
          .mutateAsync({ assignmentId: picking.assignment.id, driverId })
          .then(() => undefined)
      : reattempt
          .mutateAsync({ groupId: picking.assignment.groupId, driverId })
          .then(() => undefined);
  };

  return (
    <section>
      <h2 className={styles.pageTitle}>In transit</h2>
      <p className={styles.pageSubtitle}>
        Every delivery job by stage. Reassign a job the driver has not collected, or send a failed
        one out again.
      </p>

      <div className={styles.tabs}>
        {DELIVERY_BOARD_TABS.map((tab) => (
          <button
            key={tab.status}
            type="button"
            className={`${styles.tab} ${status === tab.status ? styles.tabActive : ''}`}
            onClick={() => setStatus(tab.status)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {listQuery.isLoading ? (
        <p className={styles.pageSubtitle}>Loading…</p>
      ) : listQuery.isError ? (
        <p className={styles.error}>Could not load deliveries.</p>
      ) : isEmpty(rows) ? (
        <div className={styles.empty}>Nothing here right now.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Vendor</th>
                <th>Driver</th>
                <th>Attempt</th>
                <th>When</th>
                <th>Details</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const photo = photoLink(row);
                return (
                  <tr key={row.id}>
                    <td className={styles.mono}>{row.orderId.slice(0, 8)}</td>
                    <td>{row.vendorName}</td>
                    <td>
                      {row.driver.name}
                      <div className={styles.meta}>{row.driver.phone}</div>
                    </td>
                    <td>{row.attemptNo}</td>
                    <td>{whenOf(row)}</td>
                    <td>
                      {row.failureReason ? (
                        <div>{DELIVERY_FAILURE_REASON_LABELS[row.failureReason]}</div>
                      ) : null}
                      {row.status === 'assigned' && row.vendorHandedOverAt ? (
                        <div className={styles.meta}>Vendor handed over</div>
                      ) : null}
                      {photo ? (
                        <a href={photo} target="_blank" rel="noreferrer">
                          View photo
                        </a>
                      ) : null}
                    </td>
                    <td>
                      {row.status === 'assigned' ? (
                        <button
                          type="button"
                          className={`${styles.button} ${styles.buttonGhost}`}
                          onClick={() => setPicking({ kind: 'reassign', assignment: row })}
                        >
                          Reassign
                        </button>
                      ) : null}
                      {row.status === 'failed' ? (
                        <button
                          type="button"
                          className={`${styles.button} ${styles.buttonPrimary}`}
                          onClick={() => setPicking({ kind: 'reattempt', assignment: row })}
                        >
                          Re-attempt
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {picking ? (
        <DriverPickerModal
          title={picking.kind === 'reassign' ? 'Reassign driver' : 'Re-attempt delivery'}
          confirmLabel={picking.kind === 'reassign' ? 'Reassign driver' : 'Start re-attempt'}
          excludeDriverId={picking.kind === 'reassign' ? picking.assignment.driver.id : undefined}
          onConfirm={confirm}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </section>
  );
}
