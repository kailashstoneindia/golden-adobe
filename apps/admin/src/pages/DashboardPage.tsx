import { Link } from 'react-router-dom';

import { ROUTES } from '@/constants/routes';
import { useAdminStatsQuery } from '@/queries';
import styles from '@/styles/shared.module.css';

export function DashboardPage() {
  const statsQuery = useAdminStatsQuery();

  if (statsQuery.isLoading) {
    return <p className={styles.pageSubtitle}>Loading dashboard…</p>;
  }

  if (statsQuery.isError || !statsQuery.data) {
    return <p className={styles.error}>Could not load dashboard stats.</p>;
  }

  const stats = statsQuery.data;

  return (
    <section>
      <h2 className={styles.pageTitle}>Dashboard</h2>
      <p className={styles.pageSubtitle}>Pending approvals and user overview</p>

      <div className={styles.statsGrid}>
        <StatCard label="Pending vendors" value={stats.pendingVendors} />
        <StatCard label="Pending ustaads" value={stats.pendingArtisans} />
        <StatCard label="Approved vendors" value={stats.approvedVendors} />
        <StatCard label="Total users" value={stats.totalUsers} />
      </div>

      <div className={styles.tabs}>
        <Link className={`${styles.tab} ${styles.tabActive}`} to={ROUTES.approvalsVendors}>
          Review vendors
        </Link>
        <Link className={styles.tab} to={ROUTES.approvalsArtisans}>
          Review ustaads
        </Link>
        <Link className={styles.tab} to={ROUTES.users}>
          Browse all users
        </Link>
      </div>
    </section>
  );
}

type StatCardProps = {
  label: string;
  value: number;
};

function StatCard({ label, value }: StatCardProps) {
  return (
    <article className={styles.statCard}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </article>
  );
}
