import type { AdminAssignmentDto } from '@golden-abode/types';

import {
  DELIVERY_ASSIGNMENT_STATUS_LABELS,
  DELIVERY_FAILURE_REASON_LABELS,
} from '@/constants/delivery.constants';
import { useAssignmentsQuery } from '@/queries';
import styles from '@/styles/shared.module.css';
import { formatDateTime } from '@/utils/date';

const MAX_ATTEMPTS_SHOWN = 50;

function Attempt({ attempt }: { attempt: AdminAssignmentDto }) {
  const times: [string, string | null][] = [
    ['Assigned', attempt.assignedAt],
    ['Vendor handed over', attempt.vendorHandedOverAt],
    ['Picked up', attempt.pickedUpAt],
    ['Delivered', attempt.deliveredAt],
    ['Failed', attempt.failedAt],
  ];
  return (
    <div className={styles.statCard}>
      <p className={styles.name}>
        {`Attempt ${attempt.attemptNo} · ${DELIVERY_ASSIGNMENT_STATUS_LABELS[attempt.status]}`}
      </p>
      <p className={styles.name}>{attempt.driver.name}</p>
      <p className={styles.meta}>{attempt.driver.phone}</p>
      {times
        .filter(([, at]) => at)
        .map(([label, at]) => (
          <p key={label} className={styles.meta}>
            {label}: {formatDateTime(at!)}
          </p>
        ))}
      {attempt.failureReason ? (
        <p className={styles.meta}>{DELIVERY_FAILURE_REASON_LABELS[attempt.failureReason]}</p>
      ) : null}
      {attempt.deliveryPhotoViewUrl ? (
        <a href={attempt.deliveryPhotoViewUrl} target="_blank" rel="noreferrer">
          Delivery photo
        </a>
      ) : null}{' '}
      {attempt.failurePhotoViewUrl ? (
        <a href={attempt.failurePhotoViewUrl} target="_blank" rel="noreferrer">
          Failure photo
        </a>
      ) : null}
    </div>
  );
}

// Decision 0060: every delivery attempt on this order, newest first. Renders
// nothing until there is one, so an order that never reached a driver shows no
// empty "Delivery" box.
export function OrderDeliverySection({ orderId }: { orderId: string }) {
  const query = useAssignmentsQuery({ orderId, page: 1, pageSize: MAX_ATTEMPTS_SHOWN });
  const attempts = query.data?.items ?? [];
  if (attempts.length === 0) return null;

  return (
    <section role="group" aria-label="Delivery" className={styles.contactBlock}>
      <h3 className={styles.sectionTitle}>Delivery</h3>
      {attempts.map((attempt) => (
        <Attempt key={attempt.id} attempt={attempt} />
      ))}
    </section>
  );
}
