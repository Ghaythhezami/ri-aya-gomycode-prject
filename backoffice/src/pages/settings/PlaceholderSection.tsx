import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { useWorkspace } from '../../auth/WorkspaceContext';
import { Button } from '../../common/Button';
import { SettingsCard } from './SettingsCard';

/**
 * The placeholder sections from the mockup (departments, appointments,
 * reminders, audit log, appearance). The card, icon and CTA match the design;
 * sections that already have a route open it, while the rest explain that the
 * module is not available yet instead of presenting a dead button.
 */
export function PlaceholderSection({ titleKey, to }: { titleKey: string; to?: string }) {
  const { t } = useTranslation();
  const { active } = useWorkspace();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(null);
  const title = t(titleKey);

  return (
    <SettingsCard
      title={title}
      description={t('settings.updateConfig', { clinic: active?.clinicName ?? '' })}
      badge={t('settings.draft')}
    >
      <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
        <span className="grid size-16 place-items-center rounded-2xl bg-accent text-primary">
          <Settings2 size={28} aria-hidden="true" />
        </span>
        <h3 className="mt-4 text-lg font-semibold text-text">{title}</h3>
        <p className="mt-2 max-w-md text-sm text-muted">
          {t('settings.placeholder.manage', { section: title })}
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-5"
          onClick={() => {
            if (to) {
              navigate(to);
            } else {
              setNotice(t('settings.placeholder.notAvailable'));
            }
          }}
        >
          {t('settings.placeholder.open', { section: title })}
        </Button>
        {notice ? (
          <p role="status" className="mt-3 text-sm text-muted">
            {notice}
          </p>
        ) : null}
      </div>
    </SettingsCard>
  );
}
