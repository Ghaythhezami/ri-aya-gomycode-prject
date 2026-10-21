import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './en.json';
import ar from './ar.json';
import fr from './fr.json';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ar: { translation: ar }, fr: { translation: fr } },
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
