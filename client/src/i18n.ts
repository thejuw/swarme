/**
 * i18n.ts — Phase 10: Internationalization Initialization
 *
 * Configures i18next with:
 *   - Browser language detection (navigator.language)
 *   - Bundled translation resources (en, fr, es)
 *   - Fallback to English for missing keys
 *
 * Import this file once in main.tsx before rendering the React tree.
 * The language detector plugin reads navigator.language and resolves
 * to the closest supported locale (e.g., "fr-FR" → "fr").
 *
 * Note: localStorage persistence is disabled because the dashboard
 * runs inside a sandboxed iframe where localStorage is blocked.
 * The user's preference is maintained in React state for the session.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";

export const supportedLanguages = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
] as const;

export type SupportedLocale = (typeof supportedLanguages)[number]["code"];

// Detect language from navigator (no localStorage/sessionStorage)
const supportedCodes = supportedLanguages.map((l) => l.code);
const browserLang = (typeof navigator !== "undefined" ? navigator.language : "en")
  .split("-")[0]
  .toLowerCase();
const detectedLng = supportedCodes.includes(browserLang as SupportedLocale)
  ? browserLang
  : "en";

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      es: { translation: es },
    },
    lng: detectedLng,
    fallbackLng: "en",
    supportedLngs: ["en", "fr", "es"],

    interpolation: {
      escapeValue: false, // React already escapes by default
    },

    // Return key path instead of empty string on missing keys
    returnEmptyString: false,
  });

export default i18n;
