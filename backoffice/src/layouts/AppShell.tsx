import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Sparkles,
  Stethoscope,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { can } from '@riaya/shared';
import { useAuth } from '../auth/AuthContext';
import { canSee } from '../auth/roles';
import { Button } from '../common/Button';
import { Dropdown } from '../common/Dropdown';
import { ToastProvider } from '../common/Toast';
import { BookingWizard } from '../features/booking/BookingWizard';
import { openBooking } from '../features/booking/booking-launcher';
import { ChatLauncher } from '../features/chat/ChatLauncher';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { useUnreadCount } from '../features/notifications/useUnreadCount';
import { GlobalSearch } from '../features/search/GlobalSearch';
import { Breadcrumbs } from './Breadcrumbs';
import { ErrorBoundary } from './ErrorBoundary';
import { HelpPopover } from './HelpPopover';
import { LanguageSwitcher } from './LanguageSwitcher';
import { OfflineBanner } from './OfflineBanner';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { readSidebarCollapsed, writeSidebarCollapsed } from './sidebar-preference';

/** Mockup order. "Design system" stays routable at /design-system but is not in the menu. */
const items = [
  { to: '/', key: 'overview', icon: LayoutDashboard },
  { to: '/appointments', key: 'appointments', icon: ClipboardList },
  { to: '/calendar', key: 'calendar', icon: CalendarDays },
  { to: '/patients', key: 'patients', icon: Users },
  { to: '/doctors', key: 'doctors', icon: Stethoscope },
  { to: '/waiting-list', key: 'waiting', icon: UsersRound },
  { to: '/scheduling', key: 'scheduling', icon: Sparkles },
  { to: '/analytics', key: 'analytics', icon: LineChart },
  { to: '/notifications', key: 'notifications', icon: Bell },
  { to: '/settings', key: 'settings', icon: Settings },
];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function NavItems({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const unread = useUnreadCount();

  return (
    <>
      {items
        .filter((item) => user && canSee(user.role, item.key))
        .map((item) => {
          const Icon = item.icon;
          const label = t(`nav.${item.key}`);
          const badge = item.key === 'notifications' && unread > 0 ? unread : 0;
          const badgeText = badge > 99 ? '99+' : String(badge);

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onNavigate}
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `relative flex min-h-11 items-center gap-3 rounded-md text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  collapsed ? 'justify-center px-0' : 'px-3'
                } ${
                  isActive
                    ? 'bg-primary font-semibold text-white'
                    : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon size={18} aria-hidden="true" />
              {!collapsed ? <span className="flex-1 truncate">{label}</span> : null}
              {badge > 0 ? (
                <span
                  className={`grid min-w-5 place-items-center rounded-full bg-alert px-1.5 text-xs font-semibold leading-5 text-white ${
                    collapsed ? 'absolute end-1 top-1' : ''
                  }`}
                >
                  <span aria-hidden="true">{badgeText}</span>
                  <span className="sr-only">{t('shellnav.unread', { count: badge })}</span>
                </span>
              ) : null}
            </NavLink>
          );
        })}
    </>
  );
}

function Brand({ collapsed = false, size = 'md' }: { collapsed?: boolean; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3">
      <img
        src={`${import.meta.env.BASE_URL}riaya-logo.png`}
        alt=""
        className={`${size === 'sm' ? 'size-10' : 'size-11'} shrink-0 rounded-lg bg-white object-contain p-0.5`}
      />
      {!collapsed ? (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{t('app.name')}</p>
          <p className="truncate text-xs text-white/60">{t('app.workspace')}</p>
        </div>
      ) : (
        <span className="sr-only">{t('app.name')}</span>
      )}
    </div>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(true);

  useEffect(() => {
    if (!open) return;

    const node = drawerRef.current;
    const restoreTarget = menuButtonRef.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    focusables()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const list = focusables();
      if (list.length === 0) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (restoreFocusRef.current) restoreTarget?.focus();
    };
  }, [open]);

  function openDrawer() {
    restoreFocusRef.current = true;
    setOpen(true);
  }

  function closeDrawer(restoreFocus = true) {
    restoreFocusRef.current = restoreFocus;
    setOpen(false);
  }

  function followNavigation() {
    closeDrawer(false);
    requestAnimationFrame(() => document.getElementById('main')?.focus());
  }

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      writeSidebarCollapsed(next);
      return next;
    });
  }

  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`;
  const toggleLabel = t(collapsed ? 'shell.expandSidebar' : 'shell.collapseSidebar');
  const canBook = can(user?.role, 'manageAppointments');

  const userItems = [
    ...(user && canSee(user.role, 'settings')
      ? [
          {
            id: 'settings',
            label: t('nav.settings'),
            icon: <Settings size={16} aria-hidden="true" />,
            onSelect: () => navigate('/settings'),
          },
        ]
      : []),
    {
      id: 'logout',
      label: t('shell.logout'),
      tone: 'danger' as const,
      icon: <LogOut size={16} aria-hidden="true" />,
      onSelect: () => {
        void logout().then(() => navigate('/login'));
      },
    },
  ];

  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg">
        <a href="#main" className="skip-link">
          {t('shell.skipToContent')}
        </a>

        <aside
          className={`fixed inset-y-0 start-0 z-20 hidden flex-col bg-sidebar text-white transition-[width] lg:flex ${
            collapsed ? 'w-20' : 'w-64'
          }`}
        >
          <div className={`py-5 ${collapsed ? 'flex justify-center px-2' : 'px-5'}`}>
            <Brand collapsed={collapsed} />
          </div>

          <nav aria-label={t('shellnav.mainNav')} className="flex-1 space-y-1 overflow-y-auto px-3">
            <NavItems collapsed={collapsed} />
          </nav>

          <div className="px-3 pb-2">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={toggleLabel}
              title={toggleLabel}
              className={`flex min-h-10 w-full items-center gap-3 rounded-md text-sm text-white/70 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white ${
                collapsed ? 'justify-center px-0' : 'px-3'
              }`}
            >
              {collapsed ? (
                <PanelLeftOpen size={18} aria-hidden="true" className="rtl:-scale-x-100" />
              ) : (
                <PanelLeftClose size={18} aria-hidden="true" className="rtl:-scale-x-100" />
              )}
              {!collapsed ? <span>{toggleLabel}</span> : null}
            </button>
          </div>

          <div className="border-t border-white/10 p-3">
            <WorkspaceSwitcher collapsed={collapsed} />
          </div>
        </aside>

        {open ? (
          <div
            className="fixed inset-0 z-40 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label={t('app.name')}
          >
            <button
              type="button"
              tabIndex={-1}
              className="absolute inset-0 bg-navy/50"
              aria-label={t('shell.closeMenu')}
              onClick={() => closeDrawer(true)}
            />
            <aside
              ref={drawerRef}
              className="relative flex h-full w-72 max-w-[85vw] flex-col bg-sidebar text-white"
            >
              <div className="flex items-center justify-between px-4 py-4">
                <Brand size="sm" />
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-md hover:bg-white/10"
                  onClick={() => closeDrawer(true)}
                  aria-label={t('shell.closeMenu')}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <nav
                aria-label={t('shellnav.mainNav')}
                className="flex-1 space-y-1 overflow-y-auto px-3"
              >
                <NavItems onNavigate={followNavigation} />
              </nav>
              <div className="border-t border-white/10 p-3">
                <WorkspaceSwitcher />
              </div>
            </aside>
          </div>
        ) : null}

        <div className={collapsed ? 'lg:ps-20' : 'lg:ps-64'}>
          <OfflineBanner />

          <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
            <div className="flex min-h-16 items-center gap-2 px-4 sm:gap-3 lg:px-8">
              <button
                ref={menuButtonRef}
                type="button"
                className="grid size-11 shrink-0 place-items-center rounded-md border border-border lg:hidden"
                onClick={openDrawer}
                aria-label={t('shell.openMenu')}
              >
                <Menu size={18} aria-hidden="true" />
              </button>

              <div className="hidden max-w-xl flex-1 sm:block">
                <GlobalSearch />
              </div>

              <div className="ms-auto flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  aria-label={t('search.label')}
                  aria-expanded={mobileSearch}
                  onClick={() => setMobileSearch((value) => !value)}
                  className="grid size-10 place-items-center rounded-md border border-border text-muted sm:hidden"
                >
                  <Search size={18} aria-hidden="true" />
                </button>
                <div className="hidden md:block">
                  <LanguageSwitcher />
                </div>
                <HelpPopover />
                <NotificationBell />
                <Dropdown
                  label={t('shell.userMenu')}
                  trigger={
                    <>
                      <span
                        aria-hidden="true"
                        className="grid size-8 place-items-center rounded-full bg-accent text-xs font-semibold text-primary"
                      >
                        {initials}
                      </span>
                      <span className="hidden text-start leading-tight lg:block">
                        <span className="block max-w-28 truncate text-sm font-medium">
                          {user?.firstName}
                        </span>
                        <span className="block text-xs text-muted">
                          {user ? t(`roles.${user.role}`, { defaultValue: user.role }) : ''}
                        </span>
                      </span>
                    </>
                  }
                  items={userItems}
                />
                {canBook ? (
                  <Button
                    onClick={() => openBooking()}
                    aria-label={t('shell.newAppointment')}
                    className="px-3 sm:px-4"
                  >
                    <Plus size={16} aria-hidden="true" />
                    <span className="hidden sm:inline">{t('shell.newAppointment')}</span>
                  </Button>
                ) : null}
              </div>
            </div>
            {mobileSearch ? (
              <div className="px-4 pb-3 sm:hidden">
                <GlobalSearch onNavigate={() => setMobileSearch(false)} />
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3 px-4 pb-1 md:hidden">
              <LanguageSwitcher />
            </div>
          </header>

          <main id="main" tabIndex={-1} className="p-4 outline-none lg:p-8">
            <Breadcrumbs />
            <ErrorBoundary resetKey={pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>

        <BookingWizard />
        <ChatLauncher />
      </div>
    </ToastProvider>
  );
}
