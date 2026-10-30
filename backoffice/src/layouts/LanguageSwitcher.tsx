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
      className="flex shrink-0 rounded-full border border-border bg-white p-1"
      role="group"
      aria-label={t('shell.language')}
    >
      {LANGS.map((lang) => (
        <button
          key={lang.id}
          type="button"
          className={`min-h-8 min-w-10 rounded-full px-2 text-xs font-semibold transition ${
            current.startsWith(lang.id)
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted hover:text-text'
          }`}
          onClick={() => void i18n.changeLanguage(lang.id)}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
