import { useState } from 'react';
import { isEmpty } from 'lodash';

import { DriverDetailModal } from '@/components/delivery/DriverDetailModal';
import { DriverFormModal } from '@/components/delivery/DriverFormModal';
import { VehiclesTab } from '@/components/delivery/VehiclesTab';
import { APP_CONSTANTS } from '@/constants/appConstants';
import { useCreateDriverMutation, useDriversQuery, useVehiclesQuery } from '@/queries';
import styles from '@/styles/shared.module.css';

type Tab = 'drivers' | 'vehicles';

function DriversTab() {
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const driversQuery = useDriversQuery({ page: 1, limit: APP_CONSTANTS.defaultPageSize });
  const vehiclesQuery = useVehiclesQuery();
  const createDriver = useCreateDriverMutation();

  const drivers = driversQuery.data?.items ?? [];

  if (driversQuery.isLoading) {
    return <p className={styles.pageSubtitle}>Loading drivers…</p>;
  }
  if (driversQuery.isError) {
    return <p className={styles.error}>Could not load drivers.</p>;
  }

  return (
    <div>
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          onClick={() => setAdding(true)}
        >
          Add driver
        </button>
      </div>

      {isEmpty(drivers) ? (
        <div className={styles.empty}>No drivers yet.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Helper</th>
                <th>Vehicle</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => (
                <tr
                  key={driver.id}
                  className={styles.clickableRow}
                  onClick={() => setSelectedId(driver.id)}
                >
                  <td>{driver.name}</td>
                  <td>{driver.phone}</td>
                  <td>
                    {driver.helperName ? `${driver.helperName} (${driver.helperPhone})` : '—'}
                  </td>
                  <td>{driver.vehicle?.registrationNumber ?? '—'}</td>
                  <td>
                    <span className={styles.badge}>{driver.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId ? (
        <DriverDetailModal driverId={selectedId} onClose={() => setSelectedId(null)} />
      ) : null}

      {adding ? (
        <DriverFormModal
          vehicles={vehiclesQuery.data ?? []}
          busy={createDriver.isPending}
          onSubmit={(body) => createDriver.mutateAsync(body)}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}

// Decision 0060: the people who deliver, and the vehicles they drive.
export function DriversPage() {
  const [tab, setTab] = useState<Tab>('drivers');

  return (
    <section>
      <h2 className={styles.pageTitle}>Drivers</h2>
      <p className={styles.pageSubtitle}>
        Drivers deliver orders that vendors have packed. Each has an optional helper and an assigned
        vehicle.
      </p>

      <div className={styles.tabs}>
        {(['drivers', 'vehicles'] as const).map((name) => (
          <button
            key={name}
            type="button"
            className={`${styles.tab} ${tab === name ? styles.tabActive : ''}`}
            onClick={() => setTab(name)}
          >
            {name === 'drivers' ? 'Drivers' : 'Vehicles'}
          </button>
        ))}
      </div>

      {tab === 'drivers' ? <DriversTab /> : <VehiclesTab />}
    </section>
  );
}
