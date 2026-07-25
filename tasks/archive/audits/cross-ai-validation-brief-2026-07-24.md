# Cross-AI validation brief — Atlas Orbital

**Date:** 2026-07-24  
**Repo:** `atlas-orbital`  
**Branch note:** at brief time, `main` was several commits ahead of `origin/main` (local audit fixes + doc cleanup). Re-check `git log origin/main..HEAD`.  
**Authority:** [`AGENTS.md`](../../../AGENTS.md) beats this file, STATUS, lessons, and anything under `tasks/archive/`.  
**Purpose:** Give a second AI enough context to **validate claims against current code**, hunt residual gaps, and propose next work — **without** treating archived audits/sweeps as an open backlog.

---

## 0. How to use this brief (for the validating AI)

1. Read **only** first: `AGENTS.md` → `tasks/STATUS.md` → `tasks/README.md`.
2. Treat **this document** as a hypothesis list + decision log, not ground truth.
3. For every “still open” item below: **grep / read / measure** on current tree. Many July 2026 audit P0s were fixed after baseline `b541a6d`.
4. Do **not** reopen “match Gaia” as a product rule. Do **not** bulk-add tests for coverage theatre.
5. Prefer reporting: `CONFIRMED still open | FIXED | PARTIAL | WRONG` + `file:line` + severity.
6. Optional excavation only: `tasks/archive/audits/*`, `tasks/archive/sweeps/*`, `tasks/archive/ROADMAP-gaia-port-era.md`.

### Suggested verification commands

```bash
npm run lint
npm run test:run
npm run docs:check
npm run build
# optional: npm run test:e2e -- --workers=1
```

Targeted examples:

```bash
npm run test:run -- orbital/regression
npm run test:run -- moonSceneFrame
npm run test:run -- hygFrame
npm run test:run -- celestialBodies
```

---

## 1. Product decisions (locked)

| Decision                                                                                                                                                                                                                     | Status | Where encoded                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| **Quality axes inegociáveis:** fidelidade astronómica/científica/física + honesty + realismo com cinematografia AAA (wow) + adaptive tiers                                                                                   | LOCKED | `AGENTS.md` Product constitution                                 |
| **Ratchet:** may always improve; must never worsen on those axes                                                                                                                                                             | LOCKED | `AGENTS.md`                                                      |
| **Implementation may change** (algorithms, defaults, UI, look constants) when ratchet holds                                                                                                                                  | LOCKED | `AGENTS.md`                                                      |
| **Gaia Sky is NOT product law** — early north star only; optional technical reference                                                                                                                                        | LOCKED | `AGENTS.md`, L41 in `tasks/lessons.md`, STATUS constitution note |
| **Tests = quality ratchet, not implementation freeze** — contracts only (ephemeris, frames, honesty, boot resilience, measurable high-tier visual regression); no DOM/Tailwind/coverage spam; may delete pins when improving | LOCKED | `AGENTS.md` §6                                                   |
| **Doc hot path slim** — agents must not browse archive as backlog                                                                                                                                                            | LOCKED | commit `64bff73`, `tasks/README.md`                              |
| **Active wave: None** — no autonomous Gaia/T6 loop                                                                                                                                                                           | LOCKED | `tasks/STATUS.md`                                                |
| **User preference:** multi-agent confusion from too many docs; prefer fewer authority docs                                                                                                                                   | LOCKED | conversation 2026-07-24                                          |

### Explicitly rejected / retired

| Old rule                                                                                                    | Replacement            |
| ----------------------------------------------------------------------------------------------------------- | ---------------------- |
| “When match Gaia vs Atlas opinion → pick Gaia” (D5 era, including bloom 0 / NoToneMapping as permanent law) | Atlas constitution     |
| DIFF GATE / Gaia 1:1 as merge gate                                                                          | Optional research only |
| Opportunity sweeps / July audits as live todo without revalidation                                          | Archive; re-check code |
| “More tests whenever behavior changes” without product-contract filter                                      | AGENTS §6              |

---

## 2. Doc topology after cleanup (commit `64bff73`)

### Hot path (agents may read by default)

| Path               | Role                                  |
| ------------------ | ------------------------------------- |
| `AGENTS.md`        | Product + engineering law             |
| `HANDOFF.md`       | Entry pointer                         |
| `CLAUDE.md`        | Claude harness → defers to AGENTS     |
| `tasks/STATUS.md`  | Work queue only                       |
| `tasks/README.md`  | Map hot vs archive                    |
| `tasks/ROADMAP.md` | Short theme index (not Gaia-era plan) |

### Archive (excavation only)

| Path                                             | Content                                      |
| ------------------------------------------------ | -------------------------------------------- |
| `tasks/archive/ROADMAP-gaia-port-era.md`         | Full Phase θ / Gaia port tiers (~2.4k lines) |
| `tasks/archive/waves/T6.4-visual-recovery.md`    | HYG visual recovery plan                     |
| `tasks/archive/audits/auditoria-*-2026-07-23.md` | GLM / Claude / Codex audit triad             |
| `tasks/archive/sweeps/*`                         | Opportunity / improvement idea mines         |
| `tasks/archive/PLAN-orbital-path-a-2026-04.md`   | Orbital Path A notes                         |
| `tasks/archive/postmortems/*`                    | Incidents                                    |

### No repo files for

- `CODEX.md`, `GEMINI.md`, `.cursorrules` — use `AGENTS.md`.

---

## 3. Major code fixes since audit baseline `b541a6d` (treat as FIXED unless refuted)

Validate by reading commits and current sources; do not re-open as P0 without evidence.

| Area                                                       | Commit(s) (approx)   | Expected current state                                           |
| ---------------------------------------------------------- | -------------------- | ---------------------------------------------------------------- |
| Moon double rotation (ecliptic children under parent pole) | `ffd4fb3`            | Split via `moonSceneFrame.ts` + `Planet.tsx` hierarchy           |
| Satellite mean motion `n` from osculating `a`              | `ffd4fb3`            | Explicit `nDegPerDay` in `satellites.ts`                         |
| HYG starfield ~136.8° frame error                          | `ffd4fb3`            | `lib/starfield/hygFrame.ts` EQ→ecliptic→Three                    |
| Meshopt/WASM CSP noise                                     | `86bed50`            | `useGLTF(path, false, false)`                                    |
| Mobile sidebar off-screen                                  | `86bed50`            | Chrome classes on child, not fixed frame                         |
| `camera.near` leak on defocus                              | `86bed50`            | Near restore path in camera controller                           |
| Reduced motion vs long camera intro                        | `de2c26e`, `98d3ebd` | Camera path honors reduced motion                                |
| WebGL unavailable → stuck loader                           | `de2c26e`            | `WebGLUnavailableCard` + e2e                                     |
| Catalog physics / model naming honesty                     | `4e0df5d`            | Data + labels reconciliation                                     |
| Deploy quality gates                                       | `7831ff0`, `98d3ebd` | `.github/workflows/deploy.yml`: lint, coverage, docs, build, e2e |
| Texture LOD / boot VRAM                                    | `41ae9d2`, `d1084df` | Overview LOD; less eager full catalog VRAM                       |
| Smart sun / orbital cache                                  | `9f8237a`            | Perf render path                                                 |
| Audit docs recorded                                        | `b5fa9ab`            | Now under `archive/audits/`                                      |
| Agent doc slim + constitution                              | `64bff73`            | This topology                                                    |

**Shipped UX honesty wins (examples):** `ScalePill`, light-travel-time on HygStarPanel (`441f4e1`).

---

## 4. Still open / needs revalidation (priority hypotheses)

> These are **candidates**. Status column is “as of last multi-agent analysis 2026-07-24”, not live measured in this brief file.

### 4.1 Scientific honesty / physics

| ID      | Hypothesis                                                                                   | Why it matters               | Where to look                                                                | Suggested check                                                             |
| ------- | -------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| P-ORB-1 | Analytical→Kepler validity boundary causes large positional jumps on Timeline scrub          | Trust-breaking “teleport”    | `registry.ts` validityRange, `keplerProvider.ts`, `engine.ts` selectProvider | Multi-epoch fixtures at year boundaries (e.g. Pluto ~2100, asteroids ~2050) |
| P-ORB-2 | Triton / some Kepler-only bodies still large angular error; tolerances may be too loose      | False green regression suite | `satellites.ts`, `celestialBodies.ts`, `regression.test.ts`                  | Compare Triton at fixture epoch vs Horizons; inspect `maxAngularErrorDeg`   |
| P-ORB-3 | Legacy parent-equatorial Kepler moons (Charon/Triton/Vanth/Weywot) frame contract incomplete | Position honesty             | `moonSceneFrame.ts`, body elements                                           | World-frame test: `child - parent` vs provider vector                       |
| P-ORB-4 | UI model badge short; uncertainty / validity not learner-readable                            | Honesty gap                  | `Sidebar.tsx` OrbitalProvenanceDisplay, `engine.ts` provenance               | Read UX copy; propose human envelope without overclaiming                   |
| P-ORB-5 | Residual catalog physics outliers (TNOs density/n/rotation)                                  | Data truth                   | `celestialBodies.ts`, `celestialBodies.test.ts`                              | Diff vs published values; KNOWN_GAPS pattern                                |

### 4.2 Assets / performance

| ID      | Hypothesis                                                                                         | Where                                                                      | Check                                           |
| ------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| P-TEX-1 | Filename `2k_`/`4k_` still misleads; estimateTextureByteSize square heuristic bias until post-load | `deferredTextureCache.ts`, `assetManifest.ts`, `textureVariantManifest.ts` | Sample real dimensions; eviction under overview |
| P-TEX-2 | Manifest/LOD incomplete for many bodies; Haumea GLB payload heavy                                  | `textureVariantManifest.ts`, models                                        | Boot network waterfall by tier                  |
| P-TEX-3 | Visual provenance sparse (~subset of bodies)                                                       | `celestialBodies.ts` visualProvenance                                      | Count bodies with vs without; UI chips          |

### 4.3 QA / delivery

| ID     | Hypothesis                                                                    | Where                               | Check                                                     |
| ------ | ----------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------- |
| P-QA-1 | No `pull_request` CI — only deploy-on-main gates                              | `.github/workflows/`                | List workflows                                            |
| P-QA-2 | Visual snapshot only win32; Linux CI baseline may be missing/fragile          | `e2e/boot.spec.ts-snapshots/`       | Presence of `*-linux.png`                                 |
| P-QA-3 | Pre-commit = format+lint+docs, not unit tests                                 | `.husky/pre-commit`                 | Read hook                                                 |
| P-QA-4 | R3F monoliths (~Planet, CameraController, Scene, Starfield) ~0% unit coverage | coverage HTML / vitest              | Confirm; prefer extract pure helpers over component tests |
| P-QA-5 | a11y e2e pins high-contrast **disabled**                                      | `e2e/a11y.spec.ts`, `A11yPanel.tsx` | Confirm; conflicts with finish-work high-contrast         |
| P-QA-6 | ~1.5k unit tests, many AI-written implementation pins — may block improve-wow | `src/**/*.test.ts`                  | Sample largest: stellarPhysics, hygBinary, shader mirrors |

### 4.4 UX / UI / i18n / a11y

| ID     | Hypothesis                                                                   | Where                                          | Check                      |
| ------ | ---------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------- |
| P-UX-1 | i18n pilot only (HygStarPanel + ScalePill); rest English; no language toggle | `src/i18n/`, `useTranslation` grep             | Count consumers            |
| P-UX-2 | Labels force `name.en`                                                       | `PlanetLabels3D`, Sidebar, FocusChip           | Language awareness         |
| P-UX-3 | Tutorial / shortcuts not localized                                           | `TutorialOverlay`, `KeyboardShortcutsModal`    | Hardcoded EN               |
| P-UX-4 | No guided scientific tour / Surprise me / date picker                        | Search, Timeline, store `setDisplayedDatetime` | Feature absence            |
| P-UX-5 | High-contrast / colorblind stubs disabled                                    | `A11yPanel`, CSS data attributes               | Wire or remove stubs       |
| P-UX-6 | Touch targets / contrast AA gaps                                             | HUD components, `index.css`                    | Spot-check 44px / contrast |
| P-UX-7 | Catalog loading invisible in Search empty state                              | SearchBar, starfield provider status           | UX gap                     |

### 4.5 Process / residual confusion

| ID       | Hypothesis                                                         | Check                            |
| -------- | ------------------------------------------------------------------ | -------------------------------- |
| P-DOC-1  | `tasks/lessons.md` still long and Gaia-centric (L41 mitigates)     | Skim; recommend further trim     |
| P-DOC-2  | External Claude memory may still say “pick Gaia”                   | Outside repo; user-side          |
| P-DOC-3  | Code comments “Gaia default” in visual presets may re-teach parity | `visualPresets.ts` + tests       |
| P-NEST-1 | Nested `oh-my-openagent-dual-oracle/` confuses monorepo tools      | Confirm if intentional vendoring |

---

## 5. Themes for future work (not committed backlog)

From slim `tasks/ROADMAP.md` + conversation ranking. **Do not implement without user priority.**

1. **Trust UI** — validity/uncertainty in human language; Kepler fallback announcement
2. **Discovery UX** — guided mission, date picker + Now, surprise/constellation
3. **i18n / a11y** — real pt-BR chrome, high-contrast classroom mode
4. **Assets / LOD** — authoritative texture manifest; tier budgets
5. **QA delivery** — PR CI; Linux snapshot; axe-core; fewer bad pins
6. **Cinematic fidelity** — AgX, selective bloom, limb darkening, anisotropy, earthshine — honest + tier-gated (not Gaia parity)

Opportunity mine (ideas only): `tasks/archive/sweeps/opportunity-sweep-findings-v2-2026-06-16.md` — filter through constitution gates.

---

## 6. User constraints for any future AI work

1. **Never worsen** science / honesty / wow / reach.
2. **May change** implementation, including deleting obsolete tests.
3. **Do not** recreate large doc surfaces that compete with AGENTS/STATUS.
4. **Do not** auto-fire Gaia port waves or “DIFF GATE” programs.
5. Prefer **smallest meaningful verification** over suite expansion.
6. Multi-agent: write findings with evidence; revalidate archive claims.

---

## 7. Suggested validation mission (for the other AI)

Deliverable structure:

```markdown
## Validation report

### A. Constitution compliance (docs still say pick-Gaia?)

### B. Audit P0 recheck table (item | claimed | current code | verdict)

### C. Top 10 remaining product risks ranked by user impact

### D. Top 5 cheap wins under constitution

### E. Explicit non-issues (fixed / overstated)

### F. Anything NEW not in this brief
```

Timebox: prefer depth on P-ORB-1/2, P-TEX-1, P-QA-1/2, P-UX-1 over re-reading entire archive ROADMAP.

---

## 8. Key file index (code)

| Domain         | Paths                                                          |
| -------------- | -------------------------------------------------------------- |
| Orbital engine | `src/lib/orbital/**`, fixtures `src/test/fixtures/horizons/`   |
| Moon frame     | `src/components/canvas/moonSceneFrame.ts`, `Planet.tsx`        |
| HYG frame      | `src/lib/starfield/hygFrame.ts`, `Starfield.tsx`               |
| Textures       | `src/lib/deferredTextureCache.ts`, `textureVariantManifest.ts` |
| Quality        | `src/lib/qualityProfile.ts`, `src/lib/graphics/**`             |
| UI shell       | `src/components/ui/**`                                         |
| Store          | `src/store.ts`, `src/store/graphicsSlice.ts`                   |
| Deploy         | `.github/workflows/deploy.yml`                                 |
| E2E            | `e2e/*.spec.ts`                                                |

---

## 9. Conversation provenance

Produced from a multi-turn session (Grok) covering:

- Deep QA/UX/UI analysis vs July audits + opportunity sweeps
- User: tests over-freeze innovation; AIs over-create tests
- User: fidelity/science/physics/AAA wow inegociável; can always improve, never worsen
- User: Gaia is no longer a rule
- Doc inventory + constitution write + archive cleanup + commit `64bff73`

**Not done in that session:** code cull of pin-tests, PR CI, UX feature builds, live browser re-measure of all audit numbers.

---

_End of brief. Re-verify against HEAD before acting._
