import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Palette,
  Plus,
  Search,
  Settings,
  Stethoscope,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { canSee } from '../auth/roles';
import { LanguageSwitcher } from './LanguageSwitcher';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

type NavItem = { to: string; key: string; icon: LucideIcon };

const groups: { key: string; items: NavItem[] }[] = [
  {
    key: 'main',
    items: [
      { to: '/', key: 'overview', icon: LayoutDashboard },
      { to: '/appointments', key: 'appointments', icon: ClipboardList },
      { to: '/calendar', key: 'calendar', icon: CalendarDays },
      { to: '/waiting-list', key: 'waiting', icon: UserRound },
    ],
  },
  {
    key: 'clinic',
    items: [
      { to: '/patients', key: 'patients', icon: Users },
      { to: '/staff', key: 'staff', icon: Stethoscope },
      { to: '/analytics', key: 'analytics', icon: LineChart },
    ],
  },
  {
    key: 'system',
    items: [
      { to: '/notifications', key: 'notifications', icon: Bell },
      { to: '/settings', key: 'settings', icon: Settings },
      { to: '/design-system', key: 'designSystem', icon: Palette },
    ],
  },
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-white shadow-[0_6px_16px_rgba(0,0,0,0.25)]">
        <img src="/riaya-mark.png" alt="" className="h-8 w-8 object-contain" />
      </span>
      <span className="leading-none">
        <span className="block text-lg font-bold tracking-tight text-white">Ri’aya</span>
        <span lang="ar" className="mt-1 block text-[11px] font-semibold text-white/55">
          رعاية
        </span>
      </span>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="sidebar-bg flex h-full flex-col text-white">
      <div className="px-5 pt-6 pb-8">
        <Brand />
      </div>

      <nav aria-label={t('shell.mainNav')} className="flex-1 space-y-7 overflow-y-auto px-3">
        {groups.map((group) => {
          const visible = group.items.filter((item) => user && canSee(user.role, item.key));
          if (!visible.length) return null;
          return (
            <div key={group.key}>
              <p className="mb-2 px-3 text-[11px] font-semibold tracking-[0.16em] text-white/40 uppercase">
                {t(`shell.group.${group.key}`)}
              </p>
              <ul className="space-y-1">
                {visible.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          `group relative flex min-h-11 items-center gap-3 rounded-[12px] px-3 text-sm font-medium transition ${
                            isActive
                              ? 'bg-white/12 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                              : 'text-white/65 hover:bg-white/6 hover:text-white'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive ? (
                              <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-linear-to-b from-[#5fd3bf] to-[#4f9df0]" />
                            ) : null}
                            <span
                              className={`grid h-8 w-8 place-items-center rounded-[10px] transition ${
                                isActive
                                  ? 'bg-linear-to-br from-teal to-blue text-white shadow-[0_6px_14px_-6px_rgba(21,101,192,0.8)]'
                                  : 'text-white/70 group-hover:text-white'
                              }`}
                            >
                              <Icon size={17} />
                            </span>
                            {t(`nav.${item.key}`)}
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="p-3">
        <div className="flex items-center gap-3 rounded-[16px] border border-white/10 bg-white/6 p-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-white/10 text-[#7fdccc]">
            <Building2 size={18} />
          </span>
          <p className="truncate text-sm font-semibold text-white/85">Central Clinic</p>
        </div>
      </div>
    </div>
  );
}

function Avatar({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { user } = useAuth();
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-linear-to-br from-[#5fd3bf] to-blue font-bold text-white ${
        size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-10 w-10 text-xs'
      }`}
    >
      {user?.firstName?.[0]}
      {user?.lastName?.[0]}
    </span>
  );
}

function UserMenu() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 items-center gap-2 rounded-full border border-border bg-white ps-1 pe-3 text-sm font-semibold text-navy transition hover:border-primary/30"
      >
        <Avatar size="sm" />
        <span className="hidden sm:inline">{user?.firstName}</span>
        <ChevronDown size={16} className={`text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute end-0 z-30 mt-2 w-64 rounded-[18px] border border-border bg-white p-2 shadow-[0_20px_40px_-16px_rgba(21,40,63,0.3)]"
        >
          <div className="flex items-center gap-3 rounded-[14px] bg-slate-50 p-3">
            <Avatar />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-navy">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-[12px] px-3 text-sm font-medium text-error transition hover:bg-red-50"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            <LogOut size={16} className="rtl:rotate-180" />
            {t('shell.logout')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="skip-link">
        {t('shell.skip')}
      </a>

      <aside className="fixed inset-y-0 start-0 z-30 hidden w-[272px] lg:block">
        <Sidebar />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-navy/50 backdrop-blur-sm"
            aria-label={t('shell.closeMenu')}
            onClick={() => setOpen(false)}
          />
          <aside className="relative h-full w-[284px] max-w-[85vw] shadow-2xl">
            <button
              type="button"
              className="absolute top-6 end-4 z-10 grid size-10 place-items-center rounded-[12px] text-white/70 hover:bg-white/10"
              onClick={() => setOpen(false)}
              aria-label={t('shell.closeMenu')}
            >
              <X size={18} />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:ps-[272px]">
        <header
          className={`sticky top-0 z-20 border-b transition ${
            scrolled
              ? 'border-border/80 bg-white/85 shadow-[0_8px_24px_-16px_rgba(21,40,63,0.25)] backdrop-blur-xl'
              : 'border-transparent bg-bg/80 backdrop-blur'
          }`}
        >
          <div className="flex h-[72px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              className="grid size-11 shrink-0 place-items-center rounded-[12px] border border-border bg-white text-navy lg:hidden"
              onClick={() => setOpen(true)}
              aria-label={t('shell.openMenu')}
            >
              <Menu size={18} />
            </button>

            <label className="relative hidden max-w-xl flex-1 sm:block">
              <span className="sr-only">{t('shell.search')}</span>
              <Search
                size={17}
                className="pointer-events-none absolute inset-y-0 start-4 my-auto text-muted"
              />
              <input
                type="search"
                className="h-11 w-full rounded-[14px] border border-border bg-white ps-11 pe-4 text-sm text-text transition placeholder:text-muted/80 hover:border-slate-300 focus:border-primary focus:ring-4 focus:ring-primary/10 focus:outline-none"
                placeholder={t('shell.search')}
              />
            </label>

            <div className="ms-auto flex items-center gap-2 sm:gap-3">
              <WorkspaceSwitcher />
              <LanguageSwitcher />
              <button
                type="button"
                className="btn-brand hidden h-11 items-center gap-2 rounded-[12px] px-4 text-sm font-semibold text-white md:inline-flex"
              >
                <Plus size={17} />
                {t('shell.newAppointment')}
              </button>
              <UserMenu />
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
