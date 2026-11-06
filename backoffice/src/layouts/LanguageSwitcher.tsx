import { useTranslation } from 'react-i18next';

const LANGS = [
  { id: 'en', label: 'EN' },
  { id: 'ar', label: 'AR' },
  { id: 'fr', label: 'FR' },
];

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage ?? 'en';

  return (
    <div
      className="flex rounded-full border border-border bg-bg p-0.5"
      role="group"
      aria-label={t('shell.language')}
    >
      {LANGS.map((lang) => (
        <button
          key={lang.id}
          type="button"
          className={`min-h-10 min-w-11 rounded-full px-2 text-xs font-semibold ${
            current.startsWith(lang.id) ? 'bg-primary text-white' : 'text-muted'
          }`}
          onClick={() => void i18n.changeLanguage(lang.id)}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
