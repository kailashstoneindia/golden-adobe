import { Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { AdminLayout } from '@/components/layout/AdminLayout';
import { ROUTES } from '@/constants/routes';
import { useSessionBootstrap } from '@/hooks/useSessionBootstrap';
import { tokenStorage } from '@/services/storage/tokenStorage';
import { useAuthStore } from '@/store';
import { ApprovalsPage } from '@/pages/ApprovalsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { LoginPage } from '@/pages/LoginPage';
import { UsersPage } from '@/pages/UsersPage';
import styles from '@/styles/shared.module.css';

function ProtectedRoute() {
  const isHydrated = useAuthStore((authStore) => authStore.isHydrated);
  const hasSession = useSessionBootstrap();
  const hasToken = Boolean(tokenStorage.getAccessToken());

  if (!isHydrated) {
    return <p className={styles.pageSubtitle}>Loading session…</p>;
  }

  if (!hasToken || !hasSession) {
    return <Navigate to={ROUTES.login} replace />;
  }

  return <Outlet />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path={ROUTES.login} element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route path={ROUTES.dashboard} element={<DashboardPage />} />
          <Route path={ROUTES.approvalsVendors} element={<ApprovalsPage />} />
          <Route path={ROUTES.approvalsArtisans} element={<ApprovalsPage />} />
          <Route path={ROUTES.users} element={<UsersPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
    </Routes>
  );
}
