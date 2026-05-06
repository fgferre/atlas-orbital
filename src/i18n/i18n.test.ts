import { afterEach, describe, expect, it } from "vitest";

import i18n, {
  DEFAULT_LANGUAGE,
  DEFAULT_NAMESPACE,
  LANGUAGE_STORAGE_KEY,
  RESOURCES,
  SUPPORTED_LANGUAGES,
} from "./index";

afterEach(async () => {
  await i18n.changeLanguage(DEFAULT_LANGUAGE);
});

describe("i18n init", () => {
  it("initializes synchronously when resources are inlined", () => {
    expect(i18n.isInitialized).toBe(true);
  });

  it("uses English as the default language in non-browser test env", () => {
    expect(i18n.language).toBe(DEFAULT_LANGUAGE);
  });

  it("registers exactly the supported languages and default namespace", () => {
    expect(i18n.options.fallbackLng).toEqual([DEFAULT_LANGUAGE]);
    expect(i18n.options.defaultNS).toBe(DEFAULT_NAMESPACE);
    for (const lng of SUPPORTED_LANGUAGES) {
      expect(i18n.hasResourceBundle(lng, DEFAULT_NAMESPACE)).toBe(true);
    }
  });

  it("pins an explicit detection contract for the browser detector", () => {
    // Codex round-1 audit on M6-A: implicit defaults include cookie /
    // sessionStorage / htmlTag detection paths. We list only the paths
    // we actively rely on so a stray `i18next` cookie elsewhere on the
    // host can't override the user's choice.
    expect(i18n.options.detection).toMatchObject({
      order: ["querystring", "localStorage", "navigator"],
      caches: ["localStorage"],
      lookupQuerystring: "lng",
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    });
    expect(LANGUAGE_STORAGE_KEY).toBe("i18nextLng");
  });
});

describe("hygStarPanel translations", () => {
  it("returns the English string by default", () => {
    expect(i18n.t("hygStarPanel.wikipedia.loading")).toBe("Loading…");
    expect(i18n.t("hygStarPanel.fields.commonName")).toBe("Common name");
    expect(i18n.t("hygStarPanel.units.solarRadii")).toBe("× Sun");
  });

  it("switches to Brazilian Portuguese when the language changes", async () => {
    await i18n.changeLanguage("pt-BR");
    expect(i18n.t("hygStarPanel.wikipedia.loading")).toBe("Carregando…");
    expect(i18n.t("hygStarPanel.fields.commonName")).toBe("Nome comum");
    expect(i18n.t("hygStarPanel.units.solarRadii")).toBe("× Sol");
  });

  it("falls back to English for unsupported languages", async () => {
    await i18n.changeLanguage("fr");
    expect(i18n.t("hygStarPanel.wikipedia.empty")).toBe(
      "No Wikipedia article found"
    );
  });

  it("resolves bare 'pt' to the 'pt-BR' regional bundle", async () => {
    await i18n.changeLanguage("pt");
    expect(i18n.t("hygStarPanel.wikipedia.empty")).toBe(
      "Nenhum artigo da Wikipédia encontrado"
    );
  });

  it("falls a regional unsupported tag back to its base language ('en-US' -> 'en')", async () => {
    await i18n.changeLanguage("en-US");
    expect(i18n.t("hygStarPanel.wikipedia.loading")).toBe("Loading…");
  });
});

describe("language resolution chain", () => {
  // Codex round-1 audit on M6-A flagged that t() assertions alone don't
  // pin the resolved language chain. `i18n.languages[0]` is the canary
  // that exposed the `nonExplicitSupportedLngs: true` regression
  // (it collapsed to ["en"] even though `t("…", { lng: "pt-BR" })`
  // would have appeared correct in some code paths). Future consumers
  // (sub-track G's settings toggle, the Wikipedia client's lang param)
  // will read these fields directly — pin them here.

  it("after changeLanguage('pt-BR'): exact match keeps both pt-BR and the en fallback in the chain", async () => {
    await i18n.changeLanguage("pt-BR");
    expect(i18n.language).toBe("pt-BR");
    expect(i18n.resolvedLanguage).toBe("pt-BR");
    expect(i18n.languages[0]).toBe("pt-BR");
    expect(i18n.languages).toContain("en");
  });

  it("after changeLanguage('pt'): bare lang resolves to the pt-BR regional bundle", async () => {
    await i18n.changeLanguage("pt");
    // i18next normalises the active language to the matched supported
    // tag, not the input "pt" — that's the canary for the
    // nonExplicitSupportedLngs regression.
    expect(i18n.language).toBe("pt-BR");
    expect(i18n.resolvedLanguage).toBe("pt-BR");
    expect(i18n.languages[0]).toBe("pt-BR");
  });

  it("after changeLanguage('en-US'): regional fall-through to base 'en'", async () => {
    await i18n.changeLanguage("en-US");
    expect(i18n.language).toBe("en");
    expect(i18n.resolvedLanguage).toBe("en");
    expect(i18n.languages[0]).toBe("en");
  });

  it("after changeLanguage('fr'): unsupported lang falls back to 'en'", async () => {
    await i18n.changeLanguage("fr");
    expect(i18n.language).toBe("en");
    expect(i18n.resolvedLanguage).toBe("en");
    expect(i18n.languages[0]).toBe("en");
  });

  it("after changeLanguage('pt-PT'): cross-region matcher routes to pt-BR (only Portuguese variant we ship)", async () => {
    await i18n.changeLanguage("pt-PT");
    expect(i18n.language).toBe("pt-BR");
    expect(i18n.resolvedLanguage).toBe("pt-BR");
    expect(i18n.languages[0]).toBe("pt-BR");
  });
});

describe("locale resource parity", () => {
  const collectKeyPaths = (obj: unknown, prefix = ""): readonly string[] => {
    if (obj === null || typeof obj !== "object") return [prefix];
    const out: string[] = [];
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      out.push(...collectKeyPaths(value, path));
    }
    return out;
  };

  it("declares the same key set in every supported locale", () => {
    const englishKeys = new Set(collectKeyPaths(RESOURCES.en.common));
    for (const lng of SUPPORTED_LANGUAGES) {
      const localeKeys = new Set(
        collectKeyPaths(
          RESOURCES[lng as keyof typeof RESOURCES][DEFAULT_NAMESPACE]
        )
      );
      expect(localeKeys).toEqual(englishKeys);
    }
  });
});
