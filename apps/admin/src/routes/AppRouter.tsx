import { Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { AdminLayout } from '@/components/layout/AdminLayout';
import { ROUTES } from '@/constants/routes';
import { tokenStorage } from '@/services/storage/tokenStorage';
import { useAuthStore } from '@/store';
import { ApprovalsPage } from '@/pages/ApprovalsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { LoginPage } from '@/pages/LoginPage';
import { UsersPage } from '@/pages/UsersPage';

function ProtectedRoute() {
  const adminUser = useAuthStore((authStore) => authStore.user);
  const hasToken = Boolean(tokenStorage.getAccessToken());

  if (!hasToken || !adminUser) {
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
