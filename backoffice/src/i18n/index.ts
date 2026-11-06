import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './en.json';
import ar from './ar.json';
import fr from './fr.json';

type Catalogue = Record<string, unknown>;

/**
 * Feature catalogues live in `features/<feature>/{en,ar,fr}.json` and are mounted
 * under the `<feature>` key, so `t('patients.title')` reads
 * `features/patients/en.json#title`. Separate files keep feature work from
 * colliding on one giant catalogue; the parity check covers them too.
 */
const featureFiles = import.meta.glob<Catalogue>('./features/*/*.json', {
  eager: true,
  import: 'default',
});

function withFeatures(base: Catalogue, locale: string): Catalogue {
  const merged: Catalogue = { ...base };
  for (const [path, catalogue] of Object.entries(featureFiles)) {
    const match = /\.\/features\/([^/]+)\/([a-z]+)\.json$/.exec(path);
    if (match && match[2] === locale) merged[match[1]!] = catalogue;
  }
  return merged;
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: withFeatures(en, 'en') },
      ar: { translation: withFeatures(ar, 'ar') },
      fr: { translation: withFeatures(fr, 'fr') },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'ar', 'fr'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export function applyDocumentDirection(lng: string) {
  const dir = lng.startsWith('ar') ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
  document.documentElement.dir = dir;
}

i18n.on('languageChanged', applyDocumentDirection);
applyDocumentDirection(i18n.language);

export default i18n;
