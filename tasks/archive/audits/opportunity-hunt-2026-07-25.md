# Opportunity hunt — 2026-07-25

**Date:** 2026-07-25  
**Method:** 7 parallel explore agents + manual re-check of top claims  
**Authority:** [`AGENTS.md`](../../../AGENTS.md) wins. This file is a **revalidation brief**, not an auto-backlog.  
**Related:** prior brief [`cross-ai-validation-brief-2026-07-24.md`](./cross-ai-validation-brief-2026-07-24.md); UI wave [`../waves/ui-redesign-2026-07-25.md`](../waves/ui-redesign-2026-07-25.md) (archived 2026-07-26).

### How to use

1. Read `AGENTS.md` → `tasks/STATUS.md` first.
2. For each ID below: re-verify against **current HEAD** before implementing.
3. Do **not** re-open items under “Do not re-open” without new evidence.
4. Prefer product contracts over test spam (AGENTS §6).

---

## 0. Do not re-open (already shipped / rejected)

| Area                                                                                                                                           | Evidence                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| UI redesign waves 1–5 (honesty chrome, labels, ContextLine, scale glide, named territory, low-tier black canvas, lens flare, label hierarchy)  | `tasks/STATUS.md`, `tasks/archive/waves/ui-redesign-2026-07-25.md` |
| HYG frame, analytical moon frame, satellite `nDegPerDay`, HYG PM on fly-to, ΔT Espenak-Meeus, mobile sidebar, WebGL card, deploy quality gates | Post-`b541a6d` commits + STATUS Cross-AI triage                    |
| ScalePill, light-travel-time (HYG), camera streaming / overview ≤2k (not “boot all 8k”)                                                        | `ScalePill.tsx`, `HygStarPanel.tsx`, `textureVariants.ts` + gates  |
| HYG search (name/Bayer/HD/HIP/Gliese) → focus → flight → sprite/mesh crossfade → panel                                                         | Path end-to-end solid                                              |
| Cross-AI rejects: hyperbolic Kepler, GPU instanced orbits, QD→star shader, etc.                                                                | STATUS “Rejected with evidence”                                    |
| Home framing “tiny system” mid-intro                                                                                                           | Wave: measure after intro (~20 s)                                  |

---

## 1. Confirmed bugs

### B1 — P0/P1 · Active high-res maps never win when a manifest `2k` exists

**Mechanism:** `pickVariant` only walks tier preference (`8k`→`4k`→`2k`) and never falls through to `canonical` once any tier path exists (`src/lib/textureVariants.ts` ~222–285). Unprefixed canonicalls (no `Nk_` prefix) only populate `availablePaths.canonical`, so focus/ultra still hits `2k` first.

| Body    | Canonical “active” (data)         | Effective runtime selection |
| ------- | --------------------------------- | --------------------------- |
| Jupiter | `jupiter_vgr1_2025.jpg` (~7200)   | `2k_jupiter.jpg`            |
| Europa  | USGS Voyager/Galileo mosaic       | `2k_europa.jpg`             |
| Titan   | Cassini ISS mosaic                | `2k_titan.jpg`              |
| Uranus  | 8k-class map without `8k_` prefix | `2k_uranus.jpg`             |

**Impact:** Catalog + `assetManifest` promise the mosaic; LOD permanently demotes it. Overview 2k is correct; **focus promotion is broken**.

**Fix direction:** Register canonicalls as `4k`/`8k` in `TEXTURE_VARIANT_MANIFEST`, or include `canonical` in focus preference order after preferred tiers.

---

### B2 — P0 · Triton systematically wrong vs Horizons

- Catalog placeholders: equatorial-style `i`, `O = w = M0 = 0` (`celestialBodies.ts`).
- Tests **require** scene/truth angle **> 5°** (`moonSceneFrame.test.ts`); regression allows **≤ 150°** (`regression.test.ts`).
- Horizons fixtures exist under `src/test/fixtures/horizons/triton-*.json` but are not inverted into catalog elements.
- Always Kepler-primary; parent-equatorial scene frame.

**Fix direction:** Derive ecliptic osculating elements from fixtures; tighten regression at epoch; align scene frame.

---

### B3 — P0 · Analytical-moon validity fallback teleports + wrong frame

| Layer       | In-window (good)                                                                           | Out-of-window (broken)                                                                |
| ----------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Provider    | Analytical ecliptic (`satellites.ts`)                                                      | Kepler from `celestialBodies` placeholders (`O/w/M0 = 0`, small equatorial-style `i`) |
| Scene frame | No parent-pole rotation (`!hasAnalyticalEphemeris` is false — registry still “analytical”) | Same — **no** pole rotation while elements are equatorial placeholders                |

Example: Phobos analytical `i ≈ 26°` ecliptic vs catalog `i ≈ 1.1°`. Validity windows ~2020–2030 (`registry.ts`).

**Repro:** Timeline scrub Phobos/Io across `2019-12-31`↔`2020-01-01` or `2030`↔`2031`.

**Fix direction:** Kepler fallback must reuse analytical osculating block **or** force parent-equatorial scene rotation when using catalog placeholders.

---

### B4 — P1 · Asteroid validity-boundary discontinuity

- Dual element tables: analytical (`asteroids.ts`) vs Kepler catalog (`celestialBodies.ts`) differ in `M0`/elements.
- Hard year switch 2000/2050. Tests cover provider flip, **not** position continuity.
- Rough estimate ~80–90° mean-anomaly jump at boundary (Ceres).

**Repro:** Ceres at `2050-12-31` vs `2051-01-01` (or 1999 vs 2000).

---

### B5 — P1 · Provenance UI lies for Kepler-primary bodies

- `keplerProvider` always sets `isFallback: true`.
- Sidebar: amber **Fallback** + default **“Analytical provider planned”** when `plannedModel` missing (`Sidebar.tsx` ~502–518).
- Triton/Eris/Charon: primary **is** Kepler with “no maintained analytical theory” (`registry.ts`) — UI invents a planned analytical model.
- Regression pins `isFallback === true` for those ids.

**Fix direction:** `isFallback` only when primary ≠ current path; copy must not invent planned models.

---

### B6 — P1 · TNO Kepler elements with fabricated `Ω = ω = M0 = 0`

Bodies: Gonggong, Quaoar, Orcus, Sedna, Salacia (contrast Haumea/Makemake/Eris full sets). Honesty gap under AGENTS fidelity rules.

---

## 2. Large opportunities (proven gaps)

### UX / product

| ID     | Opportunity                                    | Proof of gap                                                                                                         | Effort / payoff                     |
| ------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **U1** | Date picker + timeline seek                    | `setDisplayedDatetime` exists for seeks (`store.ts`); **no** UI caller; Timeline = play/rate/LIVE only               | S–M · highest “I drive the sim” win |
| **U2** | Language toggle + chrome i18n                  | en/pt-BR bundles + detector; only ScalePill + HygStarPanel use `t()`; Tutorial/rail/Timeline EN                      | M · BR audience                     |
| **U3** | ContextLine re-open HYG panel                  | Close panel → `selectedId=null`, `focusId=hyg:K`; line shows generic **“Star”**, `canReopen` requires curated `body` | S                                   |
| **U4** | Search honesty while HYG loads                 | `if (!hygCatalog) return []` — silent empty, looks like “no match”                                                   | XS–S                                |
| **U5** | Escape deselect / guided mission / Surprise me | Escape only dialogs/search; no body-to-body tour (Tutorial = chrome only)                                            | S–M discovery                       |

Also absent (lower than top 5): weight-on-planet, mag verbal qualifier, planet light-time chips, focus history forward, constellation-name-only search.

### Visual fidelity (honest + adaptive)

| ID     | Opportunity                                        | Proof of gap                                                                                                      | Effort         |
| ------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------- |
| **V1** | Solar limb darkening                               | Procedural sun uses rim **fresnel boost**, not μ-darkening (`proceduralSunShaders.ts`); profile notes T6.5 future | S              |
| **V2** | Texture anisotropy                                 | **Zero** `anisotropy` under `src/`                                                                                | XS–S           |
| **V3** | Equirect `wrapS = RepeatWrapping` on deferred maps | Procedural sets it; deferred path leaves Clamp default                                                            | XS             |
| **V4** | Earthshine on Moon                                 | No night/earthshine path; ambient 0                                                                               | S              |
| **V5** | Mars atmosphere config                             | Integrator body-agnostic; **only Earth** has `atmosphereScattering`                                               | S (config)     |
| **V6** | Bloom / AgX defaults on high-ultra                 | All `VISUAL_PRESETS` `bloomIntensity: 0` → Bloom unmounted; AgX exists, default `none`                            | S–M + eye pass |
| **V7** | HYG field colors from `spect`                      | Focused mesh/panel use spect→T_eff; bulk `buildColorAttribute` = B−V only                                         | M              |
| **V8** | Venus atmosphere map unused                        | `textures.atmosphere` on body; no consumer                                                                        | M              |

### Assets (beyond B1)

| ID     | Opportunity                                 | Proof                                                                     |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------- |
| **A1** | Incomplete LOD ladders (e.g. 4k-only moons) | Partial `TEXTURE_VARIANT_MANIFEST`; camera gates who loads, not how heavy |
| **A2** | Saturn 8k map on disk, runtime stuck at 2k  | Manifest map boot-only; ring can still be 8k                              |
| **A3** | Haumea GLB ~11 MB off texture budget        | Camera-gated (not boot-all); still unbudgeted GPU/network                 |

### QA / delivery

| ID     | Opportunity                   | Proof                                                           |
| ------ | ----------------------------- | --------------------------------------------------------------- |
| **Q1** | PR CI                         | Only `.github/workflows/deploy.yml` on `push` to `main`         |
| **Q2** | Linux boot visual baseline    | Only `e2e/.../boot-frozen-chromium-win32.png`; Actions = ubuntu |
| **Q3** | Pre-commit without unit tests | husky: prettier + lint + docs only                              |
| **Q4** | High-contrast implementation  | Store fields remain; no UI (honest); no CSS/`data-*` consumer   |

---

## 3. Suggested priority (if only six land)

1. **B1** — restore focus/ultra active mosaics (Jupiter/Europa/Titan/Uranus)
2. **B3 + B2** — moon validity fallback + Triton elements
3. **B5** — provenance UI honesty for Kepler-primary
4. **U1** — date picker (store ready)
5. **V1 + V2 + V3** — limb darkening, anisotropy, wrapS
6. **Q1 + Q2** — PR CI + Linux snapshot

Then: U2 i18n, V5 Mars atmosphere, V6 bloom/AgX defaults, V4 earthshine, U3/U4 HYG chrome honesty.

---

## 4. Method / agents (2026-07-25)

| Focus            | Output                                  |
| ---------------- | --------------------------------------- |
| Orbital honesty  | B2–B6                                   |
| Texture / LOD    | B1, A1–A3                               |
| UX / discovery   | U1–U5 + shipped checklist               |
| Visual fidelity  | V1–V8                                   |
| QA / a11y / i18n | Q1–Q4                                   |
| HYG camera path  | Path solid; U3/U4 partials              |
| Wave inventory   | Waves 1–5 closed; product themes remain |

---

## 5. Product decisions still open (documented, not defects)

| Item                                              | Note                                             |
| ------------------------------------------------- | ------------------------------------------------ |
| Home in **realistic** mode parks near Sun         | Intentional early-return on extent; product call |
| Scale glide: body radii snap; grid decade LOD lag | Documented scope of `auToWorld` transition       |
| Colorblind / high-contrast **real** effects       | UI stubs correctly removed; feature not built    |

---

_End. Re-verify against HEAD before acting._
