import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ROUTES } from '@/constants/routes';
import { selectAdminUser, selectClearSession, useAuthStore } from '@/store';
import styles from '@/styles/shared.module.css';

export function AdminLayout() {
  const navigate = useNavigate();
  const adminUser = useAuthStore(selectAdminUser);
  const clearSession = useAuthStore(selectClearSession);

  const handleLogout = () => {
    clearSession();
    navigate(ROUTES.login);
  };

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <h1 className={styles.sidebarBrand}>{APP_CONSTANTS.appName}</h1>
        <nav className={styles.nav}>
          <NavLink
            to={ROUTES.dashboard}
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
            end
          >
            Dashboard
          </NavLink>
          <NavLink
            to={ROUTES.approvalsVendors}
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
          >
            Approvals
          </NavLink>
          <div className={styles.subNav}>
            <NavLink
              to={ROUTES.approvalsVendors}
              className={({ isActive }) => `${styles.subNavLink} ${isActive ? styles.subNavLinkActive : ''}`}
            >
              Vendors
            </NavLink>
            <NavLink
              to={ROUTES.approvalsArtisans}
              className={({ isActive }) => `${styles.subNavLink} ${isActive ? styles.subNavLinkActive : ''}`}
            >
              Ustaads
            </NavLink>
          </div>
          <NavLink
            to={ROUTES.users}
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
          >
            All users
          </NavLink>
        </nav>
      </aside>

      <main className={styles.main}>
        <div className={styles.topBar}>
          <div className={styles.userMeta}>{adminUser?.name ?? 'Admin'}</div>
          <button type="button" className={`${styles.button} ${styles.buttonGhost}`} onClick={handleLogout}>
            Log out
          </button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
