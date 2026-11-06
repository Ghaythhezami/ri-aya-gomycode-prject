import { useTranslation } from 'react-i18next';
import { CircleHelp } from 'lucide-react';
import { Popover } from '../common/Popover';

/** Help button with a short popover of tips (no external destination to invent). */
export function HelpPopover() {
  const { t } = useTranslation();
  const tips = ['book', 'search', 'keyboard'] as const;

  return (
    <Popover
      label={t('shellnav.help.title')}
      preferredAlign="end"
      trigger={({ open, toggle, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t('shellnav.help.title')}
          className="grid size-10 place-items-center rounded-md border border-border bg-surface text-muted hover:text-text"
        >
          <CircleHelp size={18} aria-hidden="true" />
        </button>
      )}
    >
      <h2 className="text-sm font-semibold text-text">{t('shellnav.help.title')}</h2>
      <ul className="mt-2 space-y-2 text-sm text-muted">
        {tips.map((tip) => (
          <li key={tip}>
            <span className="font-medium text-text">{t(`shellnav.help.${tip}.title`)}</span>
            <span className="block">{t(`shellnav.help.${tip}.body`)}</span>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
