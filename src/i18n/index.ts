import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import ptBrCommon from "./locales/pt-BR/common.json";

export const SUPPORTED_LANGUAGES = ["en", "pt-BR"] as const;
export const DEFAULT_LANGUAGE = "en";
export const DEFAULT_NAMESPACE = "common";

/**
 * localStorage key the browser detector uses to persist the resolved
 * language across visits. Pinned so sub-track G's settings toggle (and
 * any future cache-clear path) can target it directly without
 * round-tripping through i18next-browser-languagedetector internals.
 */
export const LANGUAGE_STORAGE_KEY = "i18nextLng";

export const RESOURCES = {
  en: { common: enCommon },
  "pt-BR": { common: ptBrCommon },
} as const;

/**
 * Explicit browser detection contract (Codex round-1 audit on M6-A,
 * 2026-05-06): the implicit `i18next-browser-languagedetector` defaults
 * include `cookie` (reads `document.cookie["i18next"]`), `sessionStorage`,
 * and `htmlTag` paths atlas does not use. Listing only the paths we
 * actively rely on shrinks the cross-tab influence surface (a stray
 * `i18next` cookie set elsewhere on the host can no longer override the
 * user's choice) and documents intent for sub-track G's settings toggle.
 *
 * Order: querystring (`?lng=pt-BR` for testing / shareable links) →
 * localStorage (persisted preference from prior visits / sub-track G) →
 * navigator (auto-detect from browser language). Cache only to
 * localStorage; cookie/session writes are not desired.
 */
const DETECTION_CONFIG = {
  order: ["querystring", "localStorage", "navigator"],
  caches: ["localStorage"],
  lookupQuerystring: "lng",
  lookupLocalStorage: LANGUAGE_STORAGE_KEY,
};

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
    detection: { ...DETECTION_CONFIG },
    ...(isBrowser ? {} : { lng: DEFAULT_LANGUAGE }),
  });
}

export default i18n;
