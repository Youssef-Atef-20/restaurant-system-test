import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Tags,
  ShoppingBag,
  Settings2,
  Users,
  ScrollText,
  ChevronRight,
  X,
  UtensilsCrossed,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';


interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  permission?: Parameters<ReturnType<typeof useAuth>['can']>[0];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/categories', icon: Tags, label: 'Categories', permission: 'view_categories' },
  { to: '/products', icon: ShoppingBag, label: 'Products', permission: 'view_products' },
  { to: '/variants', icon: Settings2, label: 'Variants & Pricing', permission: 'view_variants' },
];

const ADMIN_MGMT_ITEMS: NavItem[] = [
  { to: '/admins', icon: Users, label: 'Administrators', permission: 'manage_admins' },
  { to: '/audit-logs', icon: ScrollText, label: 'Audit Logs', permission: 'view_audit_logs' },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { authUser, can } = useAuth();
  const navigate = useNavigate();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.permission || can(item.permission)
  );

  const visibleMgmtItems = ADMIN_MGMT_ITEMS.filter(
    (item) => !item.permission || can(item.permission)
  );

  const isOwner = authUser?.role === 'owner';

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-full
          w-[var(--sidebar-w)]
          bg-[var(--color-surface)]
          border-r border-[var(--color-border)]
          flex flex-col
          transition-transform duration-300 ease-[var(--ease-spring)]
          lg:translate-x-0 lg:static lg:z-auto
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-accent)] flex items-center justify-center">
              <UtensilsCrossed size={16} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-[var(--color-text)] leading-tight">Restaurant Admin</p>
              <p className="text-[10px] text-[var(--color-text-3)] leading-tight">Control Panel</p>
            </div>
          </button>

          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {/* Main nav */}
          <ul className="space-y-0.5" role="list">
            {visibleItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) => `
                    flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)]
                    text-sm font-medium transition-all duration-200
                    ${isActive
                      ? 'bg-[var(--color-accent-bg)] text-[var(--color-accent)]'
                      : 'text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]'
                    }
                  `}
                >
                  <item.icon size={17} />
                  <span className="flex-1">{item.label}</span>
                  <ChevronRight size={13} className="opacity-40" />
                </NavLink>
              </li>
            ))}
          </ul>

          {/* Management section */}
          {visibleMgmtItems.length > 0 && (
            <>
              <div className="mt-5 mb-2 px-3">
                <p className="text-[10px] font-semibold text-[var(--color-text-3)] uppercase tracking-widest">
                  Management
                </p>
              </div>
              <ul className="space-y-0.5" role="list">
                {visibleMgmtItems.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onClose}
                      className={({ isActive }) => `
                        flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)]
                        text-sm font-medium transition-all duration-200
                        ${isActive
                          ? 'bg-[var(--color-accent-bg)] text-[var(--color-accent)]'
                          : 'text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]'
                        }
                      `}
                    >
                      <item.icon size={17} />
                      <span className="flex-1">{item.label}</span>
                      <ChevronRight size={13} className="opacity-40" />
                    </NavLink>
                  </li>
                ))}
              </ul>
            </>
          )}
        </nav>

        {/* User info at bottom */}
        <div className="px-3 py-3 border-t border-[var(--color-border)]">
          <div className="px-3 py-2 rounded-[var(--radius-md)] bg-[var(--color-surface-2)]">
            <p className="text-xs font-semibold text-[var(--color-text)]">
              {authUser?.restaurantUser.username}
            </p>
            <p className="text-[11px] text-[var(--color-text-3)]">
              {isOwner ? 'Owner' : 'Administrator'}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
