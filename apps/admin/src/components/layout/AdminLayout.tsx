import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ROUTES } from '@/constants/routes';
import { authService } from '@/services/api/authService';
import { takeRefreshTokenForLogout } from '@/services/api/tokenRefresh';
import { selectAdminUser, selectClearSession, useAuthStore } from '@/store';
import styles from '@/styles/shared.module.css';

// A section heading stays lit on every page under it, not only on the page it
// links to.
const APPROVALS_SECTION = ['/approvals', '/artisans'];
const CATALOG_SECTION = ['/catalog'];

export function AdminLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inSection = (prefixes: string[]) =>
    prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const adminUser = useAuthStore(selectAdminUser);
  const clearSession = useAuthStore(selectClearSession);

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    // Revoke the refresh token on the server too, otherwise it stays usable for
    // its full 30 days. Best effort: the local logout never waits on the
    // revoke call, only on a refresh already in flight (see tokenRefresh.ts).
    try {
      const refreshToken = await takeRefreshTokenForLogout();
      if (refreshToken) {
        authService.logout({ refreshToken }).catch(() => undefined);
      }
    } catch {
      // Storage blocked or the lock failed: nothing to revoke from here.
    } finally {
      // Whatever happened above (storage blocked, lock failure), the admin
      // must still end up logged out locally.
      clearSession();
      navigate(ROUTES.login);
    }
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
              `${styles.navLink} ${isActive || inSection(APPROVALS_SECTION) ? styles.navLinkActive : ''}`
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
              to={ROUTES.artisans}
              end
              className={({ isActive }) =>
                `${styles.subNavLink} ${isActive ? styles.subNavLinkActive : ''}`
              }
            >
              Ustaads
            </NavLink>
            <NavLink
              to={ROUTES.artisanVerification}
              className={({ isActive }) =>
                `${styles.subNavLink} ${isActive ? styles.subNavLinkActive : ''}`
              }
            >
              Ustaad verification
            </NavLink>
            <NavLink
              to={ROUTES.artisanHireRequests}
              end
              className={({ isActive }) =>
                `${styles.subNavLink} ${isActive ? styles.subNavLinkActive : ''}`
              }
            >
              Hire requests
            </NavLink>
            <NavLink
              to={ROUTES.artisanHireRequestsAll}
              className={({ isActive }) =>
                `${styles.subNavLink} ${isActive ? styles.subNavLinkActive : ''}`
              }
            >
              All hire requests
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
            to={ROUTES.vendors}
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            Vendors
          </NavLink>
          <NavLink
            to={ROUTES.orders}
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            Orders
          </NavLink>
          <NavLink
            to={ROUTES.catalogProducts}
            className={({ isActive }) =>
              `${styles.navLink} ${isActive || inSection(CATALOG_SECTION) ? styles.navLinkActive : ''}`
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
          <button
            type="button"
            className={styles.sidebarLogout}
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
