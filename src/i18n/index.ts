import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import ptBrCommon from "./locales/pt-BR/common.json";

export const SUPPORTED_LANGUAGES = ["en", "pt-BR"] as const;
export const DEFAULT_LANGUAGE = "en";
export const DEFAULT_NAMESPACE = "common";

export const RESOURCES = {
  en: { common: enCommon },
  "pt-BR": { common: ptBrCommon },
} as const;

const isBrowser = typeof window !== "undefined";

if (!i18n.isInitialized) {
  let chain = i18n.use(initReactI18next);
  if (isBrowser) {
    chain = chain.use(LanguageDetector);
  }
  chain.init({
    resources: RESOURCES,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    defaultNS: DEFAULT_NAMESPACE,
    ns: [DEFAULT_NAMESPACE],
    interpolation: { escapeValue: false },
    ...(isBrowser ? {} : { lng: DEFAULT_LANGUAGE }),
  });
}

export default i18n;
