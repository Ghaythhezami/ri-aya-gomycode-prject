import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LineChart,
  Palette,
  Settings,
  Stethoscope,
  Users,
  UserRound,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { canSee } from '../auth/roles';
import { Button } from '../common/Button';
import { LanguageSwitcher } from './LanguageSwitcher';

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

export function AppShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 start-0 hidden w-64 flex-col bg-navy text-white lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="/logo.png" alt="" className="h-10 w-10 rounded-lg object-cover" />
          <div>
            <p className="text-sm font-semibold">{t('app.name')}</p>
            <p className="text-xs text-white/60">{t('app.workspace')}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items
            .filter((item) => user && canSee(user.role, item.key))
            .map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center gap-3 rounded-[12px] px-3 text-sm ${
                      isActive ? 'bg-primary text-white' : 'text-white/75 hover:bg-white/10'
                    }`
                  }
                >
                  <Icon size={18} />
                  {t(`nav.${item.key}`)}
                </NavLink>
              );
            })}
        </nav>
        <div className="p-4 text-xs text-white/50">Central Clinic</div>
      </aside>
      <div className="lg:ps-64">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-white/90 px-4 backdrop-blur lg:px-8">
          <input
            className="min-h-11 max-w-xl flex-1 rounded-full border border-border bg-bg px-4 text-sm"
            placeholder={t('shell.search')}
            aria-label={t('shell.search')}
          />
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Button>{t('shell.newAppointment')}</Button>
            <div className="relative">
              <details>
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border border-border px-3 text-sm">
                  <span className="grid size-8 place-items-center rounded-full bg-accent text-xs font-semibold text-primary">
                    {user?.firstName?.[0]}
                    {user?.lastName?.[0]}
                  </span>
                  {user?.firstName}
                </summary>
                <div className="absolute end-0 mt-2 w-44 rounded-[12px] border border-border bg-white p-2 shadow-(--shadow-card)">
                  <button
                    className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-sm text-error"
                    onClick={async () => {
                      await logout();
                      navigate('/login');
                    }}
                  >
                    <LogOut size={16} />
                    {t('shell.logout')}
                  </button>
                </div>
              </details>
            </div>
          </div>
        </header>
        <main id="main" className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
