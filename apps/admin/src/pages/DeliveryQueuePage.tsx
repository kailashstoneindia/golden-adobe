import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isEmpty } from 'lodash';
import type { QueueItemDto } from '@golden-abode/types';

import { DriverPickerModal } from '@/components/delivery/DriverPickerModal';
import { APP_CONSTANTS } from '@/constants/appConstants';
import { deliveryKeys, useAssignMutation, useDeliveryQueueQuery } from '@/queries';
import { ApiClientError } from '@/services';
import styles from '@/styles/shared.module.css';
import { formatWaiting } from '@/utils/waiting';

const CONFLICT = 409;

// Decision 0060: groups the vendor has packed that no driver has been given yet.
export function DeliveryQueuePage() {
  const queryClient = useQueryClient();
  const queueQuery = useDeliveryQueueQuery({ page: 1, pageSize: APP_CONSTANTS.defaultPageSize });
  const assign = useAssignMutation();
  const [picking, setPicking] = useState<QueueItemDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const items = queueQuery.data?.items ?? [];

  if (queueQuery.isLoading) {
    return <p className={styles.pageSubtitle}>Loading the queue…</p>;
  }
  if (queueQuery.isError) {
    return <p className={styles.error}>Could not load the delivery queue.</p>;
  }

  // Someone else assigned this group first: say so and show the fresh list.
  const assignTo = async (group: QueueItemDto, driverId: string) => {
    setNotice(null);
    try {
      await assign.mutateAsync({ orderVendorGroupId: group.groupId, driverId });
    } catch (error) {
      if (error instanceof ApiClientError && error.statusCode === CONFLICT) {
        setNotice('Already assigned');
        await queryClient.invalidateQueries({ queryKey: deliveryKeys.all });
        return;
      }
      throw error;
    }
  };

  return (
    <section>
      <h2 className={styles.pageTitle}>Ready to deliver</h2>
      <p className={styles.pageSubtitle}>
        Orders the vendor has packed, oldest first. Pick a driver to send each one out.
      </p>
      {notice ? <p className={styles.error}>{notice}</p> : null}

      {isEmpty(items) ? (
        <div className={styles.empty}>Nothing is waiting for a driver.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Vendor</th>
                <th>Drop</th>
                <th>Items</th>
                <th>Waiting</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.groupId}>
                  <td className={styles.mono}>{item.orderId.slice(0, 8)}</td>
                  <td>{item.vendorName}</td>
                  <td>{`${item.dropCity} ${item.dropPincode}`.trim()}</td>
                  <td>{item.itemCount}</td>
                  <td>{formatWaiting(item.readyAt)}</td>
                  <td>
                    <button
                      type="button"
                      className={`${styles.button} ${styles.buttonPrimary}`}
                      onClick={() => setPicking(item)}
                    >
                      Assign
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {picking ? (
        <DriverPickerModal
          title="Assign driver"
          confirmLabel="Assign driver"
          onConfirm={(driverId) => assignTo(picking, driverId)}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </section>
  );
}
