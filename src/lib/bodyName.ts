import type { CelestialBody } from "./astrophysics";

/**
 * Pick a body's display name for the active UI language.
 *
 * `CelestialBody.name` is keyed `{ en, pt }` while i18next resolves to BCP-47
 * tags (`"en"`, `"pt-BR"`), so the mapping needs one home — otherwise every
 * call site invents its own `startsWith("pt")` and they drift.
 *
 * Deliberately NOT used by `Sidebar` / `SearchBar`: those show both names at
 * once on purpose (English title, Portuguese subtitle), which is a bilingual
 * affordance rather than an untranslated string. This is for surfaces that
 * show exactly one name — the in-scene labels and the focus chip — which
 * previously hardcoded `name.en` regardless of the chosen language.
 */
export const resolveBodyName = (
  name: CelestialBody["name"],
  language: string | undefined
): string => (language?.toLowerCase().startsWith("pt") ? name.pt : name.en);
