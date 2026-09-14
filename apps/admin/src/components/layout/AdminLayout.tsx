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
        <div className={styles.sidebarBrandWrap}>
          <div>
            <p className={styles.authEyebrow}>Admin</p>
            <h1 className={styles.sidebarBrand}>{APP_CONSTANTS.appName}</h1>
          </div>
        </div>
        <nav className={styles.nav}>
          <NavLink
            to={ROUTES.dashboard}
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
            end
          >
            Dashboard
          </NavLink>
          <NavLink
            to={ROUTES.approvalsVendors}
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            Approvals
          </NavLink>
          <div className={styles.subNav}>
            <NavLink
              to={ROUTES.approvalsVendors}
              className={({ isActive }) =>
                `${styles.subNavLink} ${isActive ? styles.subNavLinkActive : ''}`
              }
            >
              Vendors
            </NavLink>
            <NavLink
              to={ROUTES.approvalsArtisans}
              className={({ isActive }) =>
                `${styles.subNavLink} ${isActive ? styles.subNavLinkActive : ''}`
              }
            >
              Ustaads
            </NavLink>
          </div>
          <NavLink
            to={ROUTES.users}
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            All users
          </NavLink>
          <NavLink
            to={ROUTES.catalogProducts}
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            Catalog
          </NavLink>
          <div className={styles.subNav}>
            <NavLink
              to={ROUTES.catalogProducts}
              className={({ isActive }) =>
                `${styles.subNavLink} ${isActive ? styles.subNavLinkActive : ''}`
              }
            >
              Products
            </NavLink>
            <NavLink
              to={ROUTES.catalogCategories}
              className={({ isActive }) =>
                `${styles.subNavLink} ${isActive ? styles.subNavLinkActive : ''}`
              }
            >
              Categories
            </NavLink>
            <NavLink
              to={ROUTES.catalogImport}
              className={({ isActive }) =>
                `${styles.subNavLink} ${isActive ? styles.subNavLinkActive : ''}`
              }
            >
              Import
            </NavLink>
            <NavLink
              to={ROUTES.catalogReview}
              className={({ isActive }) =>
                `${styles.subNavLink} ${isActive ? styles.subNavLinkActive : ''}`
              }
            >
              Review queue
            </NavLink>
          </div>
        </nav>
        <div className={styles.sidebarFooter}>
          <p className={styles.sidebarUser}>{adminUser?.email ?? adminUser?.name ?? 'Admin'}</p>
          <button type="button" className={styles.sidebarLogout} onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
