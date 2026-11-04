import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspace } from '../auth/WorkspaceContext';

/**
 * Workspace switcher (FR-032, AC-011).
 *
 * A view over `WorkspaceProvider`: the provider owns the memberships and the
 * active clinic, so the sidebar footer and this menu can never disagree.
 */
export function WorkspaceSwitcher() {
  const { t } = useTranslation();
  const { memberships, active, switching, switchTo } = useWorkspace();
  const [open, setOpen] = useState(false);

  if (!active) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex min-h-10 max-w-44 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-text"
      >
        <span className="truncate font-medium">{active.clinicName}</span>
        <span className="hidden text-xs text-muted sm:inline">{active.role}</span>
      </button>

      {open ? (
        <ul
          role="listbox"
          className="absolute end-0 z-20 mt-1 w-64 rounded-md border border-border bg-surface py-1 shadow-(--shadow-card)"
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
                className={`flex w-full flex-col items-start px-3 py-2 text-start text-sm hover:bg-bg ${
                  membership.clinicId === active.clinicId ? 'bg-accent' : ''
                }`}
              >
                <span className="w-full truncate font-medium text-text">
                  {membership.clinicName}
                </span>
                <span className="w-full truncate text-xs text-muted">
                  {membership.organizationName} — {membership.role}
                </span>
              </button>
            </li>
          ))}
          <li className="border-t border-border">
            <a href="/register" className="block px-3 py-2 text-sm text-primary hover:bg-bg">
              {t('workspace.createOrganization')}
            </a>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
