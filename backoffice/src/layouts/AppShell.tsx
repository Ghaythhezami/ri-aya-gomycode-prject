import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  MessageSquare,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Stethoscope,
  Users,
  UserRound,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { canSee } from '../auth/roles';
import { Button } from '../common/Button';
import { Dropdown } from '../common/Dropdown';
import { Breadcrumbs } from './Breadcrumbs';
import { LanguageSwitcher } from './LanguageSwitcher';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { readSidebarCollapsed, writeSidebarCollapsed } from './sidebar-preference';

const items = [
  { to: '/', key: 'overview', icon: LayoutDashboard },
  { to: '/appointments', key: 'appointments', icon: ClipboardList },
  { to: '/calendar', key: 'calendar', icon: CalendarDays },
  { to: '/patients', key: 'patients', icon: Users },
  { to: '/staff', key: 'staff', icon: Stethoscope },
  { to: '/waiting-list', key: 'waiting', icon: UserRound },
  { to: '/analytics', key: 'analytics', icon: LineChart },
  { to: '/notifications', key: 'notifications', icon: Bell },
  { to: '/settings', key: 'settings', icon: Settings },
  { to: '/design-system', key: 'designSystem', icon: Palette },
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

  return (
    <>
      {items
        .filter((item) => user && canSee(user.role, item.key))
        .map((item) => {
          const Icon = item.icon;
          const label = t(`nav.${item.key}`);

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onNavigate}
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `relative flex min-h-11 items-center gap-3 rounded-md text-sm transition ${
                  collapsed ? 'justify-center px-0' : 'px-3'
                } ${
                  isActive
                    ? 'bg-primary font-semibold text-white'
                    : 'text-white/75 hover:bg-surface/10'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-2 start-0 w-1 rounded-full bg-white"
                    />
                  ) : null}
                  <Icon size={18} aria-hidden="true" />
                  {!collapsed ? <span>{label}</span> : null}
                </>
              )}
            </NavLink>
          );
        })}
    </>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
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
      const first = list[0];
      const last = list[list.length - 1];

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

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="skip-link">
        {t('shell.skipToContent')}
      </a>

      <aside
        className={`fixed inset-y-0 start-0 hidden flex-col bg-navy text-white transition-[width] lg:flex ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div
          className={`flex items-center gap-3 py-5 ${collapsed ? 'justify-center px-2' : 'px-5'}`}
        >
          <img
            src="/logo.png"
            alt="RI'AYA"
            className="h-11 w-11 rounded-xl bg-black object-cover"
          />
          {!collapsed ? (
            <div>
              <p className="text-sm font-semibold">{t('app.name')}</p>
              <p className="text-xs text-white/60">{t('app.workspace')}</p>
            </div>
          ) : null}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          <NavItems collapsed={collapsed} />
        </nav>

        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={toggleLabel}
            title={toggleLabel}
            className={`flex min-h-10 w-full items-center gap-3 rounded-md text-sm text-white/70 hover:bg-surface/10 ${
              collapsed ? 'justify-center px-0' : 'px-3'
            }`}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={18} aria-hidden="true" />
            )}
            {!collapsed ? <span>{toggleLabel}</span> : null}
          </button>
        </div>

        <div className="border-t border-white/10 p-2">
          <WorkspaceSwitcher collapsed={collapsed} />
        </div>
      </aside>

      {open ? (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t('app.name')}
        >
          <button
            type="button"
            className="absolute inset-0 bg-navy/50"
            aria-label={t('shell.closeMenu')}
            onClick={() => closeDrawer(true)}
          />
          <aside ref={drawerRef} className="relative flex h-full w-64 flex-col bg-navy text-white">
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt="RI'AYA"
                  className="h-10 w-10 rounded-xl bg-black object-cover"
                />
                <p className="text-sm font-semibold">{t('app.name')}</p>
              </div>
              <button
                type="button"
                className="grid size-11 place-items-center rounded-md"
                onClick={() => closeDrawer(true)}
                aria-label={t('shell.closeMenu')}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3">
              <NavItems onNavigate={followNavigation} />
            </nav>
            <div className="border-t border-white/10 p-2">
              <WorkspaceSwitcher onNavigate={followNavigation} />
            </div>
          </aside>
        </div>
      ) : null}

      <div className={collapsed ? 'lg:ps-20' : 'lg:ps-64'}>
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur lg:px-8">
          <button
            ref={menuButtonRef}
            type="button"
            className="grid size-11 place-items-center rounded-md border border-border lg:hidden"
            onClick={openDrawer}
            aria-label={t('shell.openMenu')}
          >
            <Menu size={18} aria-hidden="true" />
          </button>

          <span id="shell-coming-soon" className="sr-only">
            {t('shell.comingSoon')}
          </span>

          <input
            disabled
            className="min-h-11 hidden max-w-xl flex-1 rounded-full border border-border bg-bg px-4 text-sm sm:block"
            placeholder={t('shell.search')}
            aria-label={t('shell.search')}
            aria-describedby="shell-coming-soon"
            title={t('shell.comingSoon')}
          />

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              disabled
              aria-label={t('nav.notifications')}
              aria-describedby="shell-coming-soon"
              title={t('shell.comingSoon')}
              className="grid size-10 place-items-center rounded-md border border-border text-muted opacity-70"
            >
              <Bell size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled
              aria-label={t('shell.chat')}
              aria-describedby="shell-coming-soon"
              title={t('shell.comingSoon')}
              className="grid size-10 place-items-center rounded-md border border-border text-muted opacity-70"
            >
              <MessageSquare size={18} aria-hidden="true" />
            </button>
            <LanguageSwitcher />
            <Button className="hidden sm:inline-flex">{t('shell.newAppointment')}</Button>
            <Dropdown
              label={t('shell.userMenu')}
              trigger={
                <>
                  <span className="grid size-8 place-items-center rounded-full bg-accent text-xs font-semibold text-primary">
                    {initials}
                  </span>
                  <span className="hidden max-w-24 truncate sm:inline">{user?.firstName}</span>
                </>
              }
              items={[
                {
                  id: 'logout',
                  label: t('shell.logout'),
                  tone: 'danger',
                  icon: <LogOut size={16} aria-hidden="true" />,
                  onSelect: () => {
                    void logout().then(() => navigate('/login'));
                  },
                },
              ]}
            />
          </div>
        </header>

        <main id="main" tabIndex={-1} className="p-4 lg:p-8">
          <Breadcrumbs />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
