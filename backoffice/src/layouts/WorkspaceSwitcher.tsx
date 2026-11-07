import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Activity, ChevronsUpDown } from 'lucide-react';
import { pickLocalized } from '@riaya/shared';
import { useWorkspace, type Membership } from '../auth/WorkspaceContext';

/**
 * Workspace switcher (FR-032, AC-011), shown as the clinic card at the bottom of the
 * sidebar.
 *
 * A view over `WorkspaceProvider`: the provider owns the memberships and the
 * active clinic, so the sidebar and this menu can never disagree. The menu opens
 * upwards, closes on Escape or an outside click and returns focus to the card. It is
 * portalled and fixed-positioned against the card so the page content never covers it,
 * also when the sidebar is collapsed to icons.
 */
export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { t, i18n } = useTranslation();
  const { memberships, active, switching, switchTo } = useWorkspace();
  const lang = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2);
  // Names in the UI language; the canonical value when that language was not entered.
  const clinicOf = (m: Membership) => pickLocalized(m.clinicNameI18n, lang, m.clinicName);
  const orgOf = (m: Membership) => pickLocalized(m.organizationNameI18n, lang, m.organizationName);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [place, setPlace] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const rtl = document.documentElement.dir === 'rtl';
      setPlace({
        position: 'fixed',
        bottom: window.innerHeight - rect.top + 8,
        ...(rtl ? { right: window.innerWidth - rect.right } : { left: rect.left }),
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open, collapsed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  if (!active) {
    return (
      <p className="truncate px-3 text-xs text-white/60" title={t('shell.noWorkspace')}>
        {collapsed ? '—' : t('shell.noWorkspace')}
      </p>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={collapsed ? `${t('shellnav.clinic')}: ${clinicOf(active)}` : undefined}
        title={`${clinicOf(active)} — ${orgOf(active)}`}
        className={`flex min-h-14 w-full items-center gap-3 rounded-md border border-white/10 bg-white/5 text-start text-white transition hover:bg-white/10 ${
          collapsed ? 'justify-center px-0' : 'px-3'
        }`}
      >
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/30 text-white"
        >
          <Activity size={18} />
        </span>
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{clinicOf(active)}</span>
              <span className="block truncate text-xs text-white/60">{orgOf(active)}</span>
            </span>
            <ChevronsUpDown size={16} aria-hidden="true" className="shrink-0 text-white/60" />
          </>
        ) : null}
      </button>

      {open
        ? createPortal(
            <ul
              ref={listRef}
              role="listbox"
              aria-label={t('shellnav.switchClinic')}
              style={place}
              className="z-50 w-72 max-w-[calc(100vw-1rem)] rounded-md border border-border bg-surface py-1 text-text shadow-(--shadow-overlay)"
            >
              {memberships.map((membership) => (
                <li key={membership.membershipId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={membership.clinicId === active.clinicId}
                    disabled={switching}
                    onClick={() => {
                      setOpen(false);
                      void switchTo(membership.clinicId);
                    }}
                    className={`flex min-h-11 w-full flex-col items-start px-3 py-2 text-start text-sm hover:bg-bg ${
                      membership.clinicId === active.clinicId ? 'bg-accent' : ''
                    }`}
                  >
                    <span className="w-full truncate font-medium text-text">
                      {clinicOf(membership)}
                    </span>
                    <span className="w-full truncate text-xs text-muted">
                      {orgOf(membership)} —{' '}
                      {t(`roles.${membership.role}`, { defaultValue: membership.role })}
                    </span>
                  </button>
                </li>
              ))}
              <li className="border-t border-border">
                <a
                  href="/register"
                  className="flex min-h-11 items-center px-3 text-sm text-primary hover:bg-bg"
                >
                  {t('workspace.createOrganization')}
                </a>
              </li>
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
