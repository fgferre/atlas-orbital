# Atlas Orbital — Active Todo

Updated: 2026-04-21 (post θ.3 de-drift ship)

This file is the single running todo list for the orbital-realism initiative.
It complements the long-form plan in `PLAN.md` (strategy) and
`tasks/lessons.md` (accumulated mistakes and corrections).

> **For at-a-glance current state + next action, read `tasks/STATUS.md`
> first.** That file is the single-screen dashboard; this one is the
> historical checklist.

## Active

### Phase θ — Gaia Sky-inspired visual upgrade — in flight (3 of 16 shipped)

**Governing doc:** `tasks/phase-gaia-sky.md` (long-form spec).
**Dashboard:** `tasks/STATUS.md` (read first for next-action).
**Prerequisite status:** Wave α **shipped 2026-04-18**. θ-phase kickoff
2026-04-19; three ondas shipped so far.

Fifteen ondas (16 commits — θ.7 splits em 7a/7b), sequenced in
`phase-gaia-sky.md §8`. Tier/reduced-motion contract é autoridade
única em `phase-gaia-sky.md §4`:

_Core star-focused (ondas originais):_

- [x] **θ.1** — Star sprite kernel — **SHIPPED 2026-04-20** (`2662f08`, `13e501e`)
- [x] **θ.1b** — Vertex solid-angle port — **SHIPPED 2026-04-20 → 2026-04-21** (`22349b0`, `583268e`, `07606be`, `0131af0`, `54e14ca`, `f8d8bff`, `8668b20`, `9b13f18`, `0961591`). Includes billboard-quad rendering + Gaia color pipeline + fragment saturate.
- [ ] **θ.1c** — Star billboard motion trails (`billboard.stretch.glsl`) — **NEXT UP**
- [x] **θ.3** — LightGlow post-process — **SHIPPED 2026-04-21** (`a27dc42`, `fdb66ae`). Sun NOT in registry (Gaia filter is HIP-billboard only). Reduced-motion gate hard-off. pmndrs Effect + light registry + conservative radial sprite.
- [ ] **θ.4** — Pseudo lens flare + lensdirt starburst (θ.2 merged in here per audit)
- [ ] **θ.5** — Camera motion blur (velocity-based reprojection)
- [ ] **θ.6** — Grading finishes (3 independent toggles: CA, vignette, grain)
- [ ] **θ.7a** — Hero-star approach LOD — detector + corona billboard
- [ ] **θ.7b** — Hero-star approach LOD — procedural surface + cross-fade
- [ ] **θ.8** — Camera feel (cinematic mode, FoV easing, surface-mode damping)

_Scene-graph / backdrop (descobertas pelo enxame Haiku, `phase-gaia-sky.md §8.5`):_

- [ ] **θ.9** — Orbit/trajectory lines com glow shader (quad-strip + core aditivo)
- [ ] **θ.10** — Camada de constelações (linhas com glow + SDF labels)
- [ ] **θ.11** — Milky Way backdrop (cubemap panorama + billboard dust)
- [ ] **θ.12** — SDF labels in-scene para estrelas nomeadas
- [ ] **θ.14** — Star Twinkle (variable-star LUT, aplicado em magnitude raw-domain)

_Coverage (adicionada pelo review Codex 2026-04-20, `phase-gaia-sky.md §8.5`):_

- [ ] **θ.15** — Anti-aliasing (FXAA/SMAA) + Unsharp mask tiering

_Out of scope (moved to §9):_

- ~~θ.2~~ merged into θ.4 (Gaia spikes live in `lensdirt.frag.glsl`, not a separate layer).
- ~~θ.13~~ output dithering (Gaia does not ship it).

**Hard constraints (see `phase-gaia-sky.md §2`, §4, §5.1 for full authority):**

- HYG binary catalog, tier layout, and transfer curve are frozen.
- AgX stays as the tone mapper; render-space chain is §5.1 literal.
- `@react-three/postprocessing` stays as the composer library.
- EffectComposer MUST use `frameBufferType: HalfFloatType` (verified by unit test per onda).
- Every ShaderMaterial added obeys L15 (useMemo constructor, no JSX children).
- Every DPR-dependent calc reads `gl.getPixelRatio()`, not `window.devicePixelRatio`.
- **Reduced Motion (§4.2, single source):** hard-disables **θ.3, θ.5, θ.14**; freezes secondary animation on θ.8, θ.11.
- θ.14 applies magnitude-domain perturbation **before** the log transfer curve (L14 literal).
- θ.7 detector math is imperative (outside React); Zustand writes only on `(heroStarId, lodStage)` tuple change (L18/L19).
- Every onda has unit-or-guard + Playwright coverage per §7 rule; constrained tier is byte-identical to pre-phase.
- Every new `scripts/build-*.mjs` requires a grep-preflight for existing equivalents (AGENTS.md §11, L7).
- Third-party assets (IAU, ESO) ship with SHA-256 pinning, schema sanitizer, and runtime fallback.

**Exit criteria:** `phase-gaia-sky.md §10`.

---

### Wave α — HDR foundation + Graphics panel — 2026-04-18 (shipped)

**Governing doc:** `tasks/implementation-roadmap.md` wave card α.
**Authoritative refs:** `tasks/lighting-backlog.md` §1.1 §1.2 §1.3 (R1 #1A/#1B/#2),
`tasks/graphics-settings-design.md` (R2 architecture), `tasks/graphics-settings-implementation-plan.md`
(Wave 0 + Wave 1).

Three-commit spine (strict order executed — all three merged 2026-04-18):

- [x] **Commit 1 — R2 Wave 0** — `refactor(graphics): single-source overrides via visualPreset lerp` (`73e75d3`)
  - [x] Extend `useVisualPresetLerp` signature with `userOverrides: GraphicsOverrides` (default `{}`).
  - [x] Per-frame math: `ref = (preset × (Mul ?? 1)) + (Delta ?? 0)` for compose-fields; absolute override for `bloomThreshold` etc.
  - [x] Identity-invariant when `overrides = {}` (same pixel output).
  - [x] Add `GraphicsOverrides` type next to the lerp (Commit 3 moved it to `graphicsSlice`).
  - [x] Add `toHaveScreenshot` assertions to `e2e/boot.spec.ts`, `e2e/focus.spec.ts`, `e2e/postprocessing.spec.ts` with `maxDiffPixelRatio: 0.001`.
  - [x] Capture baseline PNGs (commit them alongside the refactor).
  - [x] Add `useVisualPresetLerp.test.ts` — identity, `bloomIntensityMul`, `bloomThreshold` absolute.
  - [x] Gates: `npm run lint`, `npm run test:run`, `npm run build`, `npx playwright test` (visual-diff ≤ 0.1%).

- [x] **Commit 2 — R1 #1A + #1B + #2** — `feat(vfx): HDR pipeline + AgX + selective bloom + star emissive recal` (`73cd2c2`)
  - [x] **#1A** — remove `gl.toneMapping = ReinhardToneMapping` in `Scene.tsx:267`; set `gl.outputColorSpace = THREE.SRGBColorSpace` explicitly; replace `<ToneMapping />` with `<ToneMapping mode={ToneMappingMode.AGX} />`; reorder chain so ToneMapping runs last (Bloom → HueSat → BrightnessContrast → ToneMapping).
  - [x] Grep `gl.toneMapping` repo-wide — zero after this commit.
  - [x] **#1B** — introduce `vfxHdrGain` uniform on both `Starfield.tsx` and `NASAStarfield.tsx` ShaderMaterials (useMemo pattern — L15 literal; NO JSX children). Final fragment color × `vfxHdrGain`. Tier defaults: ultra 2.0 / high 1.8 / balanced 1.5 / constrained 1.0. Fed through existing `qualityProfile` plumbing.
  - [x] Update `starfieldShaderMath.ts` + `starfieldShaderMath.test.ts` — propagate `vfxHdrGain` into the final size/brightness test expectations.
  - [x] **#2** — `luminanceThreshold={1.0}` + `luminanceSmoothing={0.1}` on `<Bloom>` in `PostProcessingPipeline.tsx`.
  - [x] Re-capture Playwright baselines (pixel shift is intentional: star halos, bloom only above 1.0, crisper bright-star bloom).
  - [x] Gates: same as Commit 1.

- [x] **Commit 3 — R2 Wave 1** — `feat(graphics): graphicsSlice + Display/A11y panels + migration` (`4601969`)
  - [x] **New files:** `src/store/graphicsSlice.ts`, `src/lib/graphics/resolver.ts`, `src/lib/graphics/deviceSignals.ts`, `src/hooks/useEffectiveGraphics.ts`, `src/components/ui/DisplayPanel.tsx`, `src/components/ui/A11yPanel.tsx`, `src/components/ui/primitives/Slider.tsx`, `src/lib/graphics/resolver.test.ts`, `e2e/a11y.spec.ts`.
  - [x] **Extended:** `src/store.persistMigration.ts` (`PERSIST_VERSION 0→1`; `migrate()` branch); `src/store.persistMigration.test.ts` (v0→v1 for all 5 `qualityMode` values + preservation of `sunRenderMode`/`tutorialCompletionStatus`).
  - [x] **Modified:** `src/store.ts`, `src/lib/qualityProfile.ts` (compat shim), `src/hooks/useQualityProfile.ts`, `src/components/ui/controlPanelConfig.ts`, `src/components/ui/LayersPanel.tsx`, `e2e/quality.spec.ts`.
  - [x] **Finding 7 inline amend:** `tasks/graphics-settings-design.md §3` — Tone Mapping dropdown = `{AgX [default], ACES, Reinhard, Cineon}`; Exposure slider backs `<ToneMapping>` exposure via `useVisualPresetLerp` ref mutation.
  - [x] Finding 1 — `vfxSettings` is NOT a separate slice; R1 keys live inside `graphicsSlice.graphicsOverrides`.
  - [x] A11yPanel ships 4 rows: Reduced Motion (E, active), UI Scale (H, active), Colorblind Mode (grayed), High Contrast (grayed).
  - [x] Gates: plus new `e2e/a11y.spec.ts` and extended `e2e/quality.spec.ts`.

**After Commit 3:**

- [x] `HANDOFF.md` status block updated (commit `cb863ae` — "Wave α shipped — HDR pipeline + graphics panel status").
- [x] Final chat report delivered.

**Post-ship polish (Codex reviews + UX bugs flushed, 2026-04-18):**

- [x] `387a61c` — repair Display wiring + HDR regression + IBL flood.
- [x] `2ef0e8a` — UX polish round + visible star bloom.
- [x] `94e61a7` — visible star bloom + per-preset HYG density.
- [x] `6b6e478` — stop privileged-position reset on panel open/close.
- [x] `e7a6fcc` — Codex 2nd-round findings (P2×2 + P3×2).
- [x] `0ef3054` — retire Leva; migrate 7 calibration knobs to constants.
- [x] `51c911d` + `ce66ff3` — recalibrate 5 visualPresets for AgX pipeline.
- [x] `42072fa` + `4dcd1cc` — real heliocentric distance for preset auto-selection + Codex 2nd round.
- [x] `7487ed0` — test: pin `getPresetForContext` + heliocentric composer.
- [x] `f672086` — sync post-AgX values in pipeline comment + settings docs.

**Critical invariants (verified green at ship):**

- L15 — `vfxHdrGain` flows through useMemo'd `THREE.ShaderMaterial`.
- L17 — DPR math uses `gl.getPixelRatio()`.
- L18 — simulation-time stays outside store.
- L19 — Display panel shallow-selects, never `displayedDatetime`.
- Finding 9 — Playwright invocation is `npx playwright test` only.

**Residual (not Wave α scope):** `implementation-roadmap.md` wave β, γ, η
keep their existing checklists. Phase θ (above) is the next named work.

---

### Project-wide critical review — 2026-04-18 (done)

Plan at `~/.claude/plans/revise-este-projeto-de-zany-abelson.md` (v4).
Two independent Codex reviews + 3 Explore agents + direct code read.
10 ondas executadas (Onda 0 / 0.5 / 1 / 2 / 3 / 4 / 5 / 5.5 / 6 +
batches 8.0·10·8·9a and 9c·9b·7) — todas verdes e mergeadas. A lista
v3 tinha 11 slots; Onda 11 foi absorvida pelo batch paralelo e não
ficou como commit solto.

Deliberately **not** in scope (absorbed from Codex): WebGPU, path aliases,
`celestialBodies.ts` schema, features visuais (HDR/bloom/lens flare), pixel-diff
automatizado, reabilitar filtro de cometas até que um corpo `type:"comet"`
exista de fato.

#### Onda 0 — Quick wins (done, 2026-04-18)

- [x] **0.1** — `store.ts:347-354`: removidas escritas da chave legada
      `hasSeenTutorial` (nunca lida no código).
- [x] **0.2** — `Scene.tsx:805`: wrap do `<PostProcessingEffects />` com
      `qualityProfile.name !== "constrained"`. EffectComposer + ToneMapping +
      HueSaturation + BrightnessContrast agora não montam no tier constrained.
      SceneContent já tinha null-checks nos refs (não precisou mudar).
- [x] **0.3** — `celestialBodies.ts`: adicionado export
      `BODIES_BY_ID: ReadonlyMap<string, CelestialBody>`. Migrados 10 call
      sites em runtime (`Scene.tsx:133,409`, `CameraController.tsx:109,271`,
      `InitialCameraAnimation.tsx:88`, `SmartSunLight.tsx:40`,
      `SearchBar.tsx:58`, `Sidebar.tsx:23,38,75`, `Planet.tsx:1356,1394,1426`).
      Bonus: eliminada duplicação de `BODIES_BY_ID` que `Planet.tsx:26` tinha
      local — agora consome o canônico. Testes (4 call sites) mantidos como
      `.find()` (não são hot path; AGENTS.md #3).
- [x] **0.4** — `Planet.tsx`: alocações `new THREE.Vector3()` em useFrame
      (linhas 1026, 1499, 1567) substituídas por uma constante módulo-level
      `TMP_WORLD_POS` reutilizada. Comentário explica porque é seguro (todas
      as leituras são precedidas imediatamente por `getWorldPosition(TMP_WORLD_POS)`
      dentro do mesmo tick síncrono do useFrame).
- [x] **0.5** — `.husky/pre-commit` ganhou `npm run lint` após `lint-staged`.
      Agora ESLint é gate efetivo de commit.
- [x] **0.6** — Removido filtro de cometas que ficou morto:
      `controlPanelConfig.ts` (union + inventory entry), `store.ts` (campo
      visibility.comets + default), `SolarSystem.tsx:57` (branch),
      `OverlayPositionTracker.tsx:91` (branch), `TutorialOverlay.tsx:90`
      (mensagem ao usuário que era falsa). Tests atualizados: `store.test.ts`
      toca `asteroids` em vez de `comets`; `controlPanelConfig.test.ts`
      renomeado e atualizado para refletir inventory sem "Comets". Type
      literal `"comet"` preservado em `astrophysics.ts` e `orbital/types.ts`
      para facilitar re-adição quando um cometa real chegar.
- [x] **0.7** — `Scene.tsx:598-619`: 4 `alert()` em botões Leva de debug
      substituídos por `console.info("[debug] …")` ou `console.warn`. Alerts
      bloqueavam a thread de UI; console.info preserva feedback para devs
      e não degrada a UX de não-debug (o painel Leva já é oculto quando
      `debugMode === false`). Leva vai virar lazy-load na Onda 9.

**Verificação Onda 0:**

- `npm run lint`: ✅ clean.
- `npm run test:run`: ✅ 308/308 verdes (mesma contagem — 1 teste renomeado,
  1 assertion reapontada para `asteroids`).
- `npm run build`: ✅ 9,94 s, sem erros novos. Warnings de chunk > 500 kB
  (`index` 2.66 MB, `proceduralSurface` 608 kB, `Scene` 469 kB) são os
  previstos — serão tratados na Onda 9 (chunking + lazy Leva + lazy
  AssetStudyApp + lazy proceduralSurface).

**Arquivos tocados (Onda 0):** 14 arquivos. Diff pequeno por item; escopo
cirúrgico em cada mudança (AGENTS.md #3).

Follow-up Codex review (incorporado): `SmartSunLight.tsx:40` — removido
guard `trackedBodyId ?` (dead branch — `trackedBodyId` é sempre truthy por
causa do `"earth"` default da linha 38). Simplificação pura, sem mudança
de semântica.

Shipped em `73bb472` ("chore(onda-0): quick wins across store, scene, data
and tooling").

#### Onda 0.5 — Alinhamento de documentação (done, 2026-04-18)

- [x] **0.5.1** — `APRESENTACAO.md`: 8 edits surgicais.
  - L13: "equações de Kepler" → teorias analíticas por família (VSOP87D
    para 8 planetas, Pluto-Meeus para Plutão, ELP/MPP02-trunc para a
    Lua, Kepler osculante derivado de fixtures Horizons para demais).
  - L18: "Newton-Raphson (5 iterações)" removido — substituído por
    descrição honesta da regressão contra Horizons (28 corpos × 4
    épocas, tolerâncias por família).
  - L48: bloco de texturas 8K atualizado — agora lista apenas corpos com
    8K real no disco (Sol, Mercúrio, Vênus, Terra, Lua, Marte, Júpiter,
    Saturno, Urano, Plutão, Via Láctea). Removido "NASA GEMINI"
    unverified.
  - L52+54: "117.931 Estrelas" → "até ~109.400 estrelas no tier ultra"
    - explicação do tier automático.
  - L131-136 (pipeline): era "JSON otimizado com 117.931 estrelas ~14.6
    MB" — substituído por descrição real: binários gzipados por tier em
    `public/data/hyg-stars/` via `npm run download:hyg` +
    `npm run build:hyg`.
  - L259-266: bloco "Power-Scaled Coordinates (PSC) + floating-origin"
    era fabricação — nenhum dos dois existe no código (grep confirma
    zero matches). Substituído por descrição honesta: log-depth buffer
    do WebGL + near/far adaptativos em `CameraController` + dois modos
    de escala.
  - L305, 316, 319, 359: resumos "Kepleriana" / "117 mil estrelas" /
    "117.931" consolidados no vocabulário correto (analítica por
    família; HYG v4.2 em tiers).
  - Verificação: grep por "117.931", "Newton-Raphson", "Power-Scaled",
    "floating-origin", "117 mil" = 0 matches restantes. "Kepler" só
    aparece em contextos corretos (Kepler osculante, propagação
    Kepleriana de elementos).

- [x] **0.5.2** — `README.md` reescrito: stack R19+R3F+TS nomeada, seção
      "Orbital mechanics" aponta para `src/lib/orbital/` com regressão;
      seção "Star catalogs" documenta HYG default (scripts `download:hyg` + `build:hyg`) e NASA Eyes como opcional; seções de
      dev/testing/preview atualizadas.

- [x] **0.5.3** — `HANDOFF.md`: adicionado bloco "Status update —
      2026-04-18" logo após a Purpose section. Corrige em prosa as 5
      principais claims stale (tycho2-processed.bin deletado,
      process-hyg.js deletado, "simplified keplerian elements" → VSOP87D
      e cia, 5 Newton-Raphson iter → solveKeplerRad 12 iter/1e-12, "full
      NASA/JPL-grade ephemerides" reafirmado como rejeitado com a nuance
      correta). Corpo histórico preservado abaixo — HANDOFF por design
      é registro; só adicionamos o delta.

**Verificação Onda 0.5:** mudanças apenas de conteúdo. Cross-check: grep
em `APRESENTACAO.md` por termos proibidos = 0 matches. README e HANDOFF
leem-se coerentes com `registry.ts`, `starfield.ts`, `assetManifest.ts` e
`tasks/lessons.md`. Sem impacto em lint/test/build (docs only).

**Arquivos tocados (Onda 0.5):** 3 (APRESENTACAO.md, README.md,
HANDOFF.md) + tasks/todo.md.

Follow-up Codex review da Onda 0.5 (incorporado): 7 findings (2 Altas, 5
Médias) endereçados em APRESENTACAO.md + HANDOFF.md. Resumo:

- Escopo da regressão Horizons ajustado: 28 corpos no **baseline**
  (2025-01-01); 12 representantes em 3 épocas (2025-01-01 / 2025-07-01 /
  2026-01-01) — não "28 × 4 épocas" como eu tinha escrito. Corrigido em
  APRESENTACAO L18 e no status block do HANDOFF.
- Tamanho do catálogo: "70+ objetos" → ~45; "27+ luas" → ~23; "Plutão e
  suas 5 luas" → "Plutão e Caronte" (o catálogo ship só Caronte). Quatro
  ocorrências corrigidas.
- Texturas 8K: bloco "blanket 8192×4096 + NASA" substituído por descrição
  honesta — mix NASA/community por corpo (Júpiter é VGR1 7200×3600,
  Saturno é 2K, Urano é 8000×4336 community). Proveniência por corpo
  aponta para `src/data/assetManifest.ts`.
- Seção do shader de estrelas: fórmulas antigas (`size = 0.5 +
normalized^4.0 × 12.0`, `maxMag = 6.0 + log(zoom)`, `pow(1-dist×2, 3)`)
  substituídas pela realidade atual (compressão log NASA Eyes-style:
  `flux = 10^(-mag×0.4)`, `brightness = 2·log(1 + flux·250)`, clamps
  `[5, 50] px` e `[0.05, 1.0] α`, `pow(d, 5)` no fragmento). Seção LOD
  dinâmico trocada por descrição da seleção de tier por `qualityProfile`.
- Fórmula didática `r' = A × r^0.45` substituída por descrição correta
  (interpolação log ancorada + Hermite para heliocentral;
  `2,2 + 0,95 × raio_físico^0,55` para subsistemas) — aponta para
  `astrophysics.ts`.
- Linha do tempo: "1x / 10x / 100x" → descrição real (steps discretos de
  "3 segundos/segundo" a "3 anos/segundo", Live Sync, Pause).
- Plano de câmera: "near/far adaptativos" → honesto — `far` é fixo em
  1e15 em `Scene.tsx`; apenas `near` é adaptativo em `CameraController`.
- HANDOFF body: linha "simplified keplerian elements" (que contradizia
  o status block do topo) reescrita para descrever a realidade analítica
  atual + caveat explícito de que não é SPICE/Horizons live.

Verificação: grep final por termos problemáticos em APRESENTACAO.md
("70+", "27+", "5 luas", "r^0.45", "1x.\*10x", "117.931", "Power-Scaled",
"floating-origin") = 0 matches. Lint/test/build não rodados (docs only).

Shipped em `de50f88` + `406d921`.

#### Onda 1 — Desacoplar tick da simulação do React (done, 2026-04-18)

Maior ganho do plano. Antes desta onda, `Timeline.tsx` escrevia
`store.datetime` dentro de um `requestAnimationFrame` loop a ~60 Hz,
então Planet (×45), Starfield, SmartSunLight, Timeline e todos os 5
hooks de `useOrbitalEngine` (consumidos pelo Sidebar) re-renderizavam
60× por segundo enquanto a simulação rodava. O cache interno do
`orbitalEngine` (em `engine.ts:30`, bucket ~0,864 s) também não pegava
porque cada frame criava um `Date` novo.

- [x] **1.1** — Criado `src/lib/simulationClock.ts` com API enxuta:
      `getNow()` (polled imperativamente), `onUiTick(fn)` (4 Hz + em
      milestones), `setSpeed`, `setIsLiveMode`, `setIsPlaying`, `seek`,
      `syncFromState`, `advanceForTest`. Loop interno via `rAF`; SSR-
      guarded (sem `requestAnimationFrame` o loop não inicia, mas
      `getNow()` continua válido). 11 testes unitários
      (`src/lib/simulationClock.test.ts`).
- [x] **1.2** — `src/store.ts`: renomeado campo `datetime` →
      `displayedDatetime` + setter `setDatetime` → `setDisplayedDatetime`.
      Adicionada a bridge clock↔store no fim do arquivo:
      (a) `simulationClock.onUiTick` escreve `displayedDatetime` no
      store a cada ~250 ms enquanto playing + em milestones
      (pause/seek/live-toggle);
      (b) `useStore.subscribe` espelha `isPlaying` / `speed` /
      `isLiveMode` para o clock;
      (c) `syncFromState` no boot alinha o clock com o estado inicial
      do store e dispara o rAF loop se `isPlaying=true`.
- [x] **1.3** — `src/components/ui/Timeline.tsx`: deletado o rAF loop
      que escrevia `setDatetime` por frame. `formattedTime` e
      `formattedDate` agora lêem `displayedDatetime` (atualizam ~1 Hz
      na resolução visível dos segundos). Import `useEffect`/`useRef`
      removidos.
- [x] **1.4** — Consumers in-canvas migrados:
  - `Planet.tsx` (5 referências): subscription agora em
    `displayedDatetime` (para invalidar `orbitPoints` useMemo a 4 Hz);
    `useFrame` lê `simulationClock.getNow()` direto — sem re-render
    React. `TMP_WORLD_POS` da Onda 0.4 preservado.
  - `PlanetModel.tsx` (rotação): lê clock direto.
  - `Starfield.tsx`: subscription REMOVIDA; proper motion lê clock
    direto em `useFrame`. Componente sai do re-render hot path.
  - `SmartSunLight.tsx`: idem — subscription removida.
  - `CameraController.tsx`: `useStore.getState().datetime` → clock.
  - `InitialCameraAnimation.tsx`: idem.
- [x] **1.4c** — `src/hooks/useOrbitalEngine.ts` (5 hooks consumidos
      pelo Sidebar): trocado para `state.displayedDatetime`. Sidebar
      agora re-renderiza em 4 Hz (antes: 60 Hz) — rápido o suficiente
      para os números de distância/velocidade e incomparavelmente mais
      barato.
- [x] **1.5** — `src/store.test.ts`: rename do snapshot inicial.

**Bug pego na verificação do preview:** a primeira versão do
`syncFromState` não chamava `startLoop()` quando o `isPlaying` alvo
batia com o default da classe (`true`), então o rAF loop nunca
iniciava no boot e o relógio congelava no timestamp inicial. Fix:
`syncFromState` agora chama `startLoop`/`stopLoop` incondicionalmente
pelo estado alvo (ambos são idempotentes). Teste de regressão
`syncFromState with matching isPlaying=true still emits a UI tick
(boot parity)` adicionado.

**Verificação Onda 1:**

- `npm run lint`: ✅ clean.
- `npm run test:run`: ✅ 319/319 (+11 do `simulationClock.test.ts`).
- `npm run build`: ✅ 9,59 s, sem erros novos.
- Preview manual: app boota, canvas dimensiona corretamente, timeline
  avança 1:1 com wall clock em live mode, pause congela o relógio,
  resume continua. Zero console errors. Contador de mutações no DOM
  do relógio: ~0,67 Hz (sincroniza com mudança de segundo visível),
  **não** 60 Hz como antes.

**Arquivos tocados (Onda 1):** 11 arquivos:

- novo: `src/lib/simulationClock.ts`, `src/lib/simulationClock.test.ts`.
- modificado: `src/store.ts`, `src/store.test.ts`,
  `src/components/ui/Timeline.tsx`,
  `src/components/canvas/Planet.tsx`,
  `src/components/canvas/PlanetModel.tsx`,
  `src/components/canvas/Starfield.tsx`,
  `src/components/canvas/SmartSunLight.tsx`,
  `src/components/canvas/CameraController.tsx`,
  `src/components/canvas/InitialCameraAnimation.tsx`,
  `src/hooks/useOrbitalEngine.ts`.

Lição L18 adicionada a `tasks/lessons.md` (tick de simulação não deve
viver em Zustand quando tem consumidores hot-path em React).

Shipped em `207aaa2`, seguido por follow-up Codex `c63c74f` (setter
contract + HMR dispose).

#### Onda 2 — Hot path overlay + câmera (done, 2026-04-18)

Com Onda 1 drenada da fonte (datetime não sai mais do clock por frame),
restaram três focos de custo por frame: `scene.getObjectByName` em
loops, alocação de `Vector3` por corpo por frame, e `setOverlayItems`
sendo chamado mesmo quando nada mudava em pixels inteiros — que forçava
re-render de `PlanetOverlay` + subtree.

- [x] **2.1** — `OverlayPositionTracker.tsx`:
  - Cache module-level `meshCache: Map<string, Object3D>` para
    `scene.getObjectByName(body.id)`. Invalida lazily quando
    `mesh.parent === null` (unmount). Scene traversal passa a ser uma
    vez por corpo por sessão, não 60 × N por segundo.
  - `TMP_WORLD` module-level substitui `new THREE.Vector3()` por corpo
    por frame. Uma alocação por sessão em vez de N × 60 / s.
  - Remove `worldPos.clone()`: projeção reusa `TMP_WORLD` (após
    `.project(camera)` o vetor vira NDC; leitura acontece
    síncrona no mesmo passo).
  - **Fingerprint por pixel inteiro**: monta string
    `id|x|0|y|0|showLabel|showIcon;` para cada overlay e só chama
    `setOverlayItems(finalOverlays)` quando o fingerprint muda em
    relação ao último emitido. Sub-pixel jitter (focus tracker,
    drift lento) não dispara mais re-render do `PlanetOverlay`.
- [x] **2.2** — `PlanetOverlay.tsx`:
  - Substituído `const { overlayItems, showLabels, showIcons, selectId }
= useStore();` por 4 seletores específicos. O padrão sem
    argumento subscrevia o componente a toda mutação do store —
    datetime, hover, tutorial, focus — e re-renderizava mesmo quando
    nada do que o componente consome mudava.
  - Wrap em `React.memo` com `displayName`. Combinado com 2.1, o
    subtree HTML só re-renderiza quando a lista muda em pixel.
  - **A11y**: `<div onClick>` → `<button type="button">` em ícone e
    rótulo. Adicionados `aria-label="Focus <name>"`, classes
    `focus-visible:outline-*` para indicador de foco visível,
    `bg-transparent` + `border-0` + `p-0` para preservar o visual
    original. Navegação via Tab + Enter/Espaço agora funciona
    — alinha com o resto da UI (SearchBar, LayersPanel, dialogs).
- [x] **2.3** — `CameraController.tsx`:
  - `TMP_WORLD_POS` e `TMP_PREV_TARGET` module-level no lugar de
    `new THREE.Vector3()` e `controlsInstance.target.clone()` por
    frame.
  - `focusMeshRef` populado por `useEffect([focusId, scene])`.
    `useFrame` lê do ref; se `parent === null` (HMR/hot-swap),
    re-resolve on the fly. `scene.getObjectByName(focusId)` sai do
    caminho quente.
  - `resolveFocusTrackingFrame` ainda faz `.clone()` internamente
    — otimização dessa função fica para Onda 6 (decomposição do
    controls lib).
- [x] **2.4** — Contador em `debugMode`:
  - `OverlayPositionTracker` loga a cada segundo `setOverlayItems:
N emit / M frames / 1s` quando `debugMode === true`. Útil para
    validar o ganho em navegação futura sem instrumentar por fora.

**Verificação Onda 2:**

- `npm run lint`: ✅ clean.
- `npm run test:run`: ✅ 319/319 (sem novos testes — Onda 2 é refactor
  de paths já exercitados).
- `npm run build`: ✅ 12,45 s; tamanho de bundle inalterado.
- Preview smoke: app boota, canvas dimensiona, zero console errors.
  Observer de mutações no container do `PlanetOverlay` conta
  **0 mutações em 3 s** com câmera parada. Antes: até 60 × N mutações
  por frame (cada `setOverlayItems` fazia `PlanetOverlay` re-renderizar
  completo, mesmo subpixel). Ganho observável > 99 % em idle.
- A11y: botões navegáveis por Tab, indicador de foco visível quando
  focado via teclado (`focus-visible`).

**Arquivos tocados (Onda 2):** 3 arquivos:
`src/components/canvas/OverlayPositionTracker.tsx`,
`src/components/canvas/PlanetOverlay.tsx`,
`src/components/canvas/CameraController.tsx`.

Lição L19 adicionada a `tasks/lessons.md` (hygiene do hot path em
useFrame: cache de getObjectByName, scratch vectors module-level,
fingerprint em pixel para evitar setOverlayItems redundante).

Shipped em `bb1bf2a`, seguido por follow-up Codex `ce9d88a` (ring
scratch vectors + a11y tab stops).

#### Onda 3 — Cache orbital: medir antes de mexer (done, 2026-04-18)

Plano mandava instrumentar o cache existente no `orbitalEngine`
(engine.ts:30, bucket ~0,864 s, TTL 1 s) e decidir com base em dados
se precisava de mais fix. Com Ondas 1/2 drenadas, a hipótese era que
o cache já estaria performando bem.

- [x] **3.1** — `src/lib/orbital/engine.ts`: adicionados counters
      privados `cacheHits`, `cacheMisses`, `cacheBypassed` (este
      último para o special case do Sol, que pula o cache).
      `getCacheStats()` estendido com `hits`, `misses`, `bypassed`,
      `hitRate` além do `size`/`entries` já existente.
      `resetCacheStats()` novo para janelas de medição.
- [x] **3.1b** — Novo `src/components/canvas/OrbitalEngineDebugReporter.tsx`
      montado como sibling de `PlanetOverlay` fora do Canvas. Enquanto
      `debugMode === true`, loga stats a cada 1 s + reset para refletir
      a janela.
- [x] **3.2** — Medição ao vivo em preview (4 amostras consecutivas
      em live-play idle, câmera parada):
  - Antes do 3.4: `hitRate=98.1% (hits=2288 miss=44 bypass=61) size=1628`.
  - Depois do 3.4: `hitRate=98.3% (hits=2552 miss=44 bypass=67) size=880`.
  - Overlay continua em `0 emit / 54 frames / 1s` (Onda 2 ainda vale).
  - **Caveat (Codex follow-up 2026-04-18):** o `size` é o total do Map,
    não o número de entries vivas — o engine só evicta lazy no read e
    nem mesmo varre na miss. Crescimento monotônico por sessão. A queda
    1628 → 880 é confounded por `preview_stop/start` entre as medições
    (nova sessão, menos tempo acumulado), e não pode ser atribuída ao
    3.4. O ganho real do 3.4 está no React (memo não invalida a 4 Hz),
    não no `size` do cache. Hit rate (98.1 → 98.3%) é mais
    significativo. Eviction policy (TTL sweep / LRU) ficou em backlog.
- [x] **3.3** — **NÃO ship**. Codex #1 já previa: criar um cache
      paralelo seria duplicação. A medição confirma — ~44 misses/s é
      exatamente 1 miss por bucket transition por corpo, esperado do
      bucket 0,864 s. As Ondas 1/2 já entregaram o ganho estrutural.
- [x] **3.4** — `Planet.tsx:1446-1499`: removido `displayedDatetime`
      do dep array do `orbitPoints` useMemo. `orbitDateBucket` já é a
      chave real — dentro de um bucket a polilinha é topologicamente
      idêntica (sweep de elipse osculante no epoch do bucket).
      `displayedDatetime` continua passando para
      `getOrbitalDisplayOrbitPoints`, mas só em cache-miss (bucket
      cruzando). Comment block explica a intenção +
      `eslint-disable-next-line` direcionado ao array de deps. Hit rate
      subiu 98.1 → 98.3%, `size` caiu de 1628 → 880 porque a memo não
      empurra mais entries a cada 4 Hz.

**Verificação Onda 3:**

- `npm run lint`: ✅ clean.
- `npm run test:run`: ✅ 319/319.
- `npm run build`: ✅ 9,86 s.
- Preview manual: zero console errors, órbitas visualmente idênticas.
  Reporter emite linhas consistentes.

**Arquivos tocados (Onda 3):** 4:

- novo: `src/components/canvas/OrbitalEngineDebugReporter.tsx`
- modificado: `src/lib/orbital/engine.ts`,
  `src/components/canvas/Planet.tsx`,
  `src/components/canvas/Scene.tsx` (import + mount do reporter).

Não precisei adicionar L20 — o conteúdo prático está em L18 (tick
decoupling) e L19 (hot-path hygiene). A medição confirma que o padrão
das ondas anteriores foi suficiente.

Shipped em `11a7c96`, seguido por follow-up Codex `aa6144c` (split
de `getCacheStats()` + correção da narrativa `size` + 8 unit tests
novos em `engine.test.ts`).

#### Onda 4 — Higiene Zustand + persist (done, 2026-04-18)

- [x] **4.1 — `useStore()` sem seletor:** grep com padrão
      `useStore\s*\(\s*\)` retorna **zero** matches em código
      runtime (única ocorrência é um comentário em `PlanetOverlay.tsx`
      explicando por que NÃO usamos mais esse padrão). O anti-pattern
      foi extinto junto com a Onda 2.
- [x] **4.2 — Middleware de persistência:** migrado `src/store.ts`
      para `create<AppState>()(persist(...))` da Zustand 5.
  - Três chaves antigas (`qualityMode`, `sunRenderMode`,
    `tutorialStatus`) + uma chave morta já purgada
    (`hasSeenTutorial`) consolidadas na chave unificada
    `atlas-orbital-store` com envelope `{ state, version: 0 }`.
  - `partialize` serializa apenas os 3 campos que realmente
    precisam persistir (`qualityMode`, `sunRenderMode`,
    `tutorialCompletionStatus`) — resto é efêmero por sessão.
  - `onRehydrateStorage` deriva `showTutorial` de
    `tutorialCompletionStatus` (null → mostra pra novo usuário;
    não-null → não mostra pra quem já viu). Substitui a leitura
    inline de `localStorage.getItem("tutorialStatus")` que o
    initial state fazia antes.
  - `setQualityMode` / `setSunRenderMode` / `closeTutorial` /
    `completeTutorial` deixaram de chamar `localStorage.setItem`
    direto — persist escuta mudanças do store e sincroniza
    sozinho.
  - Migração one-shot: `migrateLegacyStorage()` roda no top-level
    ANTES de `create(...)`. Se encontra chaves antigas + não
    encontra a nova, sintetiza o envelope unificado. Legacy keys
    ficam intocadas (belt & suspenders para eventual rollback).
  - Storage guard: quando `localStorage` é indefinido (SSR, vitest
    environment `node`), persist recebe `storage: undefined` e
    opera em memória — `createJSONStorage(() => localStorage)`
    sem guard crashava no `getItem`.
- [x] **4.2b — `store.test.ts`:** três assertions que verificavam
      keys legadas (`localStorageMock.getItem("sunRenderMode")`
      etc.) removidas. Persist middleware é código de terceiros
      bem testado — nosso contrato é o state em si, que já é
      verificado.
- [x] **4.3 — `useShallow`:** grep por seletores retornando objeto
      ou array composto (`useStore((s) => ({...}))`,
      `useStore((s) => [...])`) retorna **zero** matches. Todos
      os ~118 call sites passam seletores escalares (`(s) => s.foo`).
      `useShallow` não tem aplicação prática nesta base de código —
      foi descartado do escopo desta onda por AGENTS.md #16
      (racionalização: não adicionar complexidade sem ganho).

**Verificação Onda 4:**

- `npm run lint`: ✅ clean.
- `npm run test:run`: ✅ 327/327 (sem novos testes; rename/remove
  de 3 assertions compensado pela cobertura de estado que já
  existia).
- `npm run build`: ✅ 9,18 s, sem erros.
- Preview smoke com usuário pré-existente (tinha `qualityMode=ultra`
  - `tutorialStatus=completed` na localStorage antiga): após a
    migração, `atlas-orbital-store` contém
    `{ state: { qualityMode: "ultra", sunRenderMode: "auto",
tutorialCompletionStatus: "completed" }, version: 0 }` e o state
    runtime reflete. Tutorial não abre. Legacy keys permanecem
    intocadas.
- Round-trip: toggle `sunRenderMode` "auto" → "procedural" via UI
  grava imediatamente no envelope persist (`{ ..., sunRenderMode:
"procedural", ... }`). Funciona sem tocar em nenhum código de
  setter custom.

**Arquivos tocados (Onda 4):** 2: `src/store.ts`, `src/store.test.ts`.

#### Onda 5 — Starfield: L15 latente + dedup mínimo (done, 2026-04-18)

Escopo decidido conforme AGENTS.md #3/#16: dois passos cirúrgicos em
vez dos três planejados. O 5.2 (“StarfieldPoints base wrapper”) foi
avaliado e descartado — os dois componentes têm sets de atributos e
uniformes suficientemente diferentes (HYG: `mag`+`ci`+`velocity` com
proper motion animada por `yearsSinceJ2000`; NASA: `starColor` vec4
empacotando absMag em `.a` sem proper motion, com `nearFade`) para
que um wrapper comum fosse um pass-through de ~30 linhas sem
compartilhar nenhuma lógica real. Documentado aqui para evitar re-
entrar na mesma ideia.

- [x] **5.1 — L15 aplicado em `NASAStarfield.tsx`.** Este era o único
      consumidor restante do padrão `<shaderMaterial uniforms={{...}}>`
      como child JSX (Starfield.tsx já havia sido corrigido em sessões
      anteriores conforme `tasks/lessons.md` L15). Trocado por
      `useMemo(() => new THREE.ShaderMaterial({...}), [])` + `material`
      prop no `<points>`. `materialRef` eliminado em favor do identity
      estável do objeto memoizado. Mutation per-frame da
      `particleSize.value` agora aterrissa na mesma `uniforms` map que
      o `WebGLProgram` compilado está bindado.
- [x] **5.3 — Hook compartilhado `useStarfieldParticleSize`.** Extraída
      a fórmula NASA Eyes (`sqrt(max(w,h) * DPR) / 60` usando
      `gl.getPixelRatio()` — não `window.devicePixelRatio`) para
      `src/components/canvas/useStarfieldParticleSize.ts`. Ambos
      `Starfield.tsx` e `NASAStarfield.tsx` consomem. Retorna um número
      recomputado a cada render (estável entre renders, reavaliado no
      resize via `useThree((s) => s.size)`). Consumidores fecham sobre
      ele dentro de `useFrame` e mutam `particleSize.value`.
  - Seletores específicos em `useThree` (`(s) => s.gl`, `(s) => s.size`)
    em vez de desestruturação do objeto completo, para evitar que o
    hook force re-render em mudanças irrelevantes.
  - Comentário extenso no módulo explicando por que é `gl.getPixelRatio()`
    e não `window.devicePixelRatio` — evita regressão futura do bug de
    DPR duplo em displays retina com profile constrained.

**Verificação Onda 5:**

- `npm run lint`: ✅ clean (disable de `react-hooks/immutability`
  em `NASAStarfield.tsx` foi removido depois que o ESLint confirmou
  que não era mais necessário com o material fora do padrão JSX).
- `npm run test:run`: ✅ 340/340 (sem novos testes; `starfieldShaderMath.test.ts`
  continua cobrindo a curva de transferência, que é o contrato real
  do shader; a mecânica React/Three do componente não muda).
- `npm run build`: ✅ 8,58 s, sem novos warnings.
- Preview HYG: sky renderiza com B-V coloring idêntico; cruzes de
  referência visíveis.
- Preview NASA: sky renderiza com sprites de tamanho variado; nenhum
  erro de console; Sun centrado, starfield estável em zoom.
- Regressão L15: uniforms de `NASAStarfield` mutados no `useFrame` agora
  aterrissam no mesmo objeto que o GPU amostra (antes, cada render
  recriava o `{ particleSize: { value } }` literal no JSX; R3F
  reassign-ava e as escritas per-frame caíam num objeto órfão).

**Arquivos tocados (Onda 5):** 3:
`src/components/canvas/NASAStarfield.tsx`,
`src/components/canvas/Starfield.tsx`,
`src/components/canvas/useStarfieldParticleSize.ts` (novo).

**Codex follow-up (Média) — DPR reactivity hole:** Codex apontou que a
primeira versão do hook cristalizava o `viewportScale` em tempo de
render, assinando só `state.gl` e `state.size`. Mas `<Canvas dpr={...}>`
em `Scene.tsx:392` dispara transições de DPR mutando `gl.setPixelRatio()`
sem mudar a identidade de `gl` nem `size` — em profile transitions
(auto → ultra, re-classificação) os sprites ficariam descalibrados até
algum re-render alheio invalidar o hook. O hook foi reescrito para
retornar um **callback** `() => number` (com `useCallback` estável
sobre `[gl, size]`); consumidores invocam per-frame dentro de
`useFrame`, lendo `gl.getPixelRatio()` ao vivo — paridade exata com o
comportamento pré-extração. Testes e preview HYG+NASA verdes.

#### Onda 5.5 — Deduplicar pipeline de modelos (done, 2026-04-18)

Contexto Codex #2: `PlanetModel.tsx` (runtime) e `AssetStudyApp.tsx`
(superfície de estudo) replicavam clone + normalização + UV esférico +
`mergeVertices` + dispose + material-prep. Drift silencioso entre os
dois é o pior lugar para divergência — o estudo existe precisamente
como superfície de confiança para o runtime.

- [x] **5.5.1 — Criado `src/lib/assetProcessing.ts`** com 5 helpers
      puros: `applyDepthSettings`, `disposeObject3D`,
      `normalizeToUnitSphereScale`, `cloneGlbSceneForRuntime(scene,
adjustMaterial?)`, `prepareObjMeshGeometry(geometry)`.
      Construção de material (roughness, metalness, emissive,
      map-selection) fica per-component porque as duas superfícies
      intencionalmente divergem (estudo: 0.95 flat para
      reprodutibilidade; runtime: body-specific + emissive fill
      lights). Visitor callback no clone GLB é invocado per-material
      (não per-mesh) para cobrir `material[]` transparentemente.
- [x] **5.5.2 — `PlanetModel.tsx` refatorado:** `GLBModel` usa
      `cloneGlbSceneForRuntime(scene, visitor)` substituindo o traverse
      manual + `applyStandardSurfaceSettings`. `OBJModel` usa
      `prepareObjMeshGeometry(geometry)` no lugar do
      `mergeVertices(ensureSphericalUvProjection(g.clone()))` +
      `computeVertexNormals`. Ambos consomem
      `normalizeToUnitSphereScale` em vez da math Box3 inline.
      `applyDepthSettings` e `disposeObject3D` trocados pelos shared.
- [x] **5.5.3 — `AssetStudyApp.tsx` refatorado:** mesma substituição
      exata nos três componentes (`StudyGlbBody`, `StudyObjBody`).
      Bonus: `BODIES_BY_ID` local (construído inline) foi trocado pelo
      canônico de `src/data/celestialBodies.ts` (já usado pelo resto
      do runtime desde Onda 0.3), eliminando mais uma duplicação.
- [x] **5.5.4 — Testes unitários:** `src/lib/assetProcessing.test.ts`
      com 17 casos cobrindo: - `applyDepthSettings` — material simples + array. - `disposeObject3D` — dispose de geometry/material único, array
      de materiais, ignora non-mesh. - `normalizeToUnitSphereScale` — box 4³ → 0.5, box 2×1×0.5 → 1,
      grupo vazio → 1 (fallback). - `prepareObjMeshGeometry` — retorna instância nova (não muta),
      popula UV quando ausente, recomputa normais. - `cloneGlbSceneForRuntime` — clona geometry + material,
      castShadow/receiveShadow, depth settings, visitor chamado
      per-material com mesh owner, normalization scale derivado do
      clone, material arrays.

**Verificação Onda 5.5:**

- `npm run lint`: ✅ clean.
- `npm run test:run`: ✅ 357/357 (+17 new).
- `npm run build`: ✅ 8,08 s.
- Preview runtime (`/atlas-orbital/`): Solar System + HYG renderizando
  sem erros; Sun + label visíveis.
- Preview asset study (`/atlas-orbital/?study=asset-review`): 13
  canvases mountados, Pallas (OBJ) renderizando com shape procedural
  correto (UV esférica + normals suaves); Haumea (GLB) renderizando com
  elipsoide elongado + texture map + shadows.
- Zero regressão visual: antes/depois identity-preserving para ambas
  as superfícies (mesma math, mesmo resultado; apenas fatorado).

**Arquivos tocados (Onda 5.5):** 4:
`src/lib/assetProcessing.ts` (novo),
`src/lib/assetProcessing.test.ts` (novo),
`src/components/canvas/PlanetModel.tsx`,
`src/components/ui/AssetStudyApp.tsx`.

**Codex follow-up (P2 + P3):**

- **P2 — Docstring de `disposeObject3D` estava factualmente errado.**
  O texto afirmava que `scene.clone()` / `obj.clone()` produzem
  geometrias e materiais próprios — mas `THREE.Object3D.clone()` é
  shallow: a árvore clonada compartilha as referências até o caller
  destacar explicitamente. Passar raw loader output aqui destruiria os
  recursos cacheados para o app inteiro. Docstring reescrito com o
  **ownership contract** explícito (só chamar em árvores cujo mesh
  já teve geometry/material destacados via `cloneGlbSceneForRuntime`
  ou construídos com `prepareObjMeshGeometry`). Os 2 call sites atuais
  respeitam o contrato; o comentário agora protege usos futuros.
- **P3 — Behavior change latente em GLBs multi-material.** A versão
  pré-refactor do `AssetStudyApp` só aplicava os overrides flat
  (0.9 / 0.02 / body.color) quando `child.material` passava
  `instanceof MeshStandardMaterial`. Para `material[]` a condição
  falhava e os sub-materiais autorais do GLB eram preservados. O
  extract passou a aplicar por-material (consistente com a intenção
  do visitor), o que seria observável se um GLB futuro trouxesse
  sub-materiais distintos. Os GLBs atuais (`Haumea_1_1000.glb`,
  `Vesta_1_100.glb`) são single-material, então latent — mas não
  strictly identity-preserving. Guard adicionado no visitor do
  `StudyGlbBody`: `if (Array.isArray(mesh.material)) return;`
  restaura a semântica antiga. Regression test em
  `assetProcessing.test.ts` documenta o padrão: material único
  recebe override, material array retém valores autorais.

Verificação follow-up: lint clean, 358/358 (+1 new), preview asset
study ok (Haumea GLB renderiza idêntico ao pré-guard por ser
single-material — o guard é no-op no caso atual, por construção).

#### Onda 6 — Extrair Planet.tsx + Scene.tsx (done, 2026-04-18)

Maior refactor do plano. Delegado a 2 agentes general-purpose em
paralelo (arquivos independentes) com restrições cirúrgicas: scratch
vectors módulo-level preservados, `simulationClock.getNow()` dentro de
`useFrame`, `eslint-disable` em `orbitPoints` deps mantido, gate
`qualityProfile.name !== "constrained"` em PostProcessing preservado,
padrão scene-env-intensity-ref inalterado, Ctrl+Shift+D debug preservado.

**6.1 — `Planet.tsx` (1760 → 806 linhas)**
Extraído em `src/components/canvas/planet/`:

- `progradeArrow.ts` (28 l) — constantes + PROGRADE_ARROW_SHAPE +
  PROGRADE_ARROW_EXTRUDE_SETTINGS (pure data, zero React).
- `SunScreenFlare.tsx` (275 l) — componente SunScreenFlare + helpers
  `createRadialGradientTexture` / `createStarburstTexture`.
- `useOrbitalSalience.ts` (125 l) — hook consolidando `focusAncestorIds`,
  `orbitSalience`, `assetPriority`, `baseTextureSalience` + o
  `PARENT_BY_ID` map. Retorno via `useMemo` para stable identity.
- `usePlanetAssets.ts` (226 l) — hook que resolve texture requests e
  gerencia todos os `useDeferredTexture` (map, ring, cloud, night,
  normal, roughness). Retorna assets + flags (`mapSalience`,
  `shouldPinMap`, etc). `screenSalience` state + useFrame ficam em
  `PlanetVisual` (acoplados à scale/camera readback).
- `usePlanetMaterials.ts` (479 l) — hook construindo todos os materiais
  (cloudMaterial, cloudShadowMaterial, atmosphereMaterial, planetMaterial
  com Earth night-lights + ring-shadows, ringMaterial, ringGeometry) +
  todos os dispose effects.
- `PlanetOrbitLine.tsx` (29 l) — `forwardRef` do `<Line>` para o
  `orbitLineRef` continuar mutável pelo parent useFrame.
- `PlanetMotionOverlays.tsx` (48 l) — `forwardRef` do grupo da seta
  prograde para parent useFrame continuar driving scale/position.

Planet.tsx agora contém: `Planet` (composição), `PlanetVisual`
(materials + JSX + useFrame de screen-salience/shader uniforms), e
`PlanetVisualWrapper` (Suspense + ErrorBoundary). ~800 linhas restantes
são JSX + useFrame (orbit fade + prograde physics + position update) +
imports — honestamente irredutível sem mexer em comportamento.

**6.2 — `Scene.tsx` (817 → 415 linhas)**
Extraído em `src/components/canvas/scene/`:

- `PostProcessingPipeline.tsx` (74 l) — export renomeado de
  `PostProcessingEffects` → `PostProcessingPipeline` (sem consumer
  externo). `memo` + 3 `useCallback` ref adapters preservados.
  Interfaces `BloomController`, `HueSaturationController`,
  `BrightnessContrastController` moveram junto.
- `SceneLighting.tsx` (36 l) — os três lights (ambient, point,
  SmartSunLight) em um componente passando refs.
- `useVisualPresetLerp.ts` (148 l) — hook com o `useFrame` inteiro de
  preset-lerping que morava em `SceneContent`. Mantém sceneRef pattern
  para env-intensity. Exporta `DebugValues`.
- `useSceneDebugControls.ts` (239 l) — hook owning todo o
  `useControls` Leva + sync effect no debugMode. `console.info`/
  `console.warn` preservados (Onda 0.7).

`SceneContent` deletado — substituído por um `VisualPresetLerpBridge`
trivial (6 linhas) porque `useFrame` precisa de componente dentro do
`<Canvas>`. `CriticalSceneAssetsGate`, `DeferredTextureBudgetGate`,
`DynamicZoom`, `NormalizedWheelZoom` ficaram inline por serem pequenos
e acoplados à JSX tree do Scene (AGENTS.md #16 racionalização).

**Verificação Onda 6:**

- `npm run lint`: ✅ clean.
- `npm run test:run`: ✅ 358/358 (sem testes novos — teste via preview
  é mais eficaz para refactor estrutural UI-heavy; testes de hooks
  vão na Onda 7 quando `.test.tsx` + jsdom estiverem wired).
- `npm run build`: ✅ 8,12 s.
- Preview: Sun renderiza (SunScreenFlare + flare sprites), sistema
  solar overview com orbits + labels + starfield (PlanetOrbitLine),
  Saturno focado com ring system + moons (ringMaterial + ringGeometry +
  nested bodies), Earth focada com Moon visível (Earth night-lights
  shader path). Zero regressão visual.

**Invariants preservados (verificados por inspeção):**

- `TMP_WORLD_POS`, `TMP_RING_INV_MATRIX`, `TMP_RING_SUN_LOCAL`
  module-level em `Planet.tsx` (onde os dois hot-path `useFrame`
  consomem).
- `simulationClock.getNow()` dentro dos dois `useFrame` em `Planet.tsx`.
- `eslint-disable-next-line react-hooks/exhaustive-deps` na array de
  deps do `orbitPoints`; `displayedDatetime` continua fora do dep list.
- Materials via `useMemo(() => new THREE.ShaderMaterial(...), [...])`
  com identity estável (L15). Zero `<shaderMaterial uniforms={{...}}>`
  JSX child pattern introduzido.
- `ErrorBoundary` + `Suspense` wrappers em `PlanetVisualWrapper` para
  ambos os branches (`PlanetModel` + `PlanetVisual`).
- `assetPriority` + `baseTextureSalience` flow `Planet` →
  `PlanetVisualWrapper` → `PlanetVisual`.
- Cada `useStore((s) => s.X)` continua granular — zero compound
  selectors introduzidos.
- Cada `useEffect` cleanup disposing materials/geometries/textures
  retido.
- Cada `useMemo` dep array idêntico ao original.

**Arquivos tocados (Onda 6):** 13:

- Modificados: `src/components/canvas/Planet.tsx`,
  `src/components/canvas/Scene.tsx`.
- Novos em `src/components/canvas/planet/`: 7 arquivos.
- Novos em `src/components/canvas/scene/`: 4 arquivos.

**Deltas de tamanho:**

- Planet.tsx: 1760 → 806 (−954 linhas).
- Scene.tsx: 817 → 415 (−402 linhas).
- Total adicionado em módulos novos: ~1210 (planet) + ~497 (scene) l.
- Saldo net: +351 linhas (boilerplate inevitável de hook signatures +
  stable-identity `useMemo`s). Trade aceitável: dois arquivos
  gigantes com responsabilidades múltiplas viraram 11 módulos focados.

**Codex review (`ac5976f`): aprovado sem findings.** Codex verificou
por leitura contra o parent commit + ran `npm run build` e
`npm run test:run` (35 files / 358 tests). Invariants confirmados:
scratch state módulo-level, `simulationClock.getNow()` no useFrame,
`orbitPoints` invalidando via `orbitDateBucket` (não
`displayedDatetime`), gate `constrained` do PostProcessing, sceneRef
indirection para `environmentIntensity`, `forwardRef` expondo Three
objects mutáveis ao parent useFrame, hooks retornando identidades
memoizadas. Zero cleanup/dispose gap introduzido, zero regressão de
dep array. Residual risk flagado: validação interativa de
preset-toggling e churn de GPU de longa duração não foi exercida pelo
Codex — nosso smoke preview (Sun/overview/Saturno/Earth) cobriu parte,
mas o stress-test completo fica para a Onda 7 (Playwright reproduzível).

#### Batch 2026-04-18 — Ondas 8.0 + 10 + 8 + 9a (paralelo)

Crítica Codex pós-Onda 6 motivou reordenação: "se o critério é dor
sentida pelo usuário agora, a ordem estava invertida". Batch executado
em 4 frentes: 1 inline (8.0 + plan sync v4) + 3 agentes general-purpose
em paralelo (Onda 8, 9a, 10). Plano master sincronizado em
`~/.claude/plans/revise-este-projeto-de-zany-abelson.md` para v4.

**Onda 8.0 — splash dismiss no asset-study (done inline, `5c39c0b`)**

- `src/lib/dismissBootSplash.ts` (novo, 32 l) — extrai two-step dismiss
  (`data-state="handoff"` → 360 ms → `remove()`) em helper com cancel
  function para `useEffect` cleanup.
- `src/components/ui/AssetStudyApp.tsx` — `useEffect(() =>
dismissBootSplash(), [])`. Loader.tsx intocado (migra numa passe de
  limpeza futura).
- Bug era pré-existente: `App.tsx:45` asset-study branch pula Loader;
  splash ficava preso indefinidamente em `?study=asset-review`.
  Verificado em preview: `splashExists=false` sem intervenção.

**Onda 10 — telemetry facade (done Agente C, `806b21f`)**

- `src/lib/telemetry.ts` (novo) — 4 canais × 3 levels. API
  `telemetry.info/warn/error(channel, msg, data?)`. Dev forwarda pra
  `console.*` com prefixo `[channel]`; prod: `info`/`warn` no-op
  (dead-code-eliminated), `error` sempre forwarda. Facade, não SDK.
- `src/lib/telemetry.test.ts` — 5 casos (dev/prod gating, channels,
  level independence, data pass-through).
- Migração estratégica de 4 call sites: `starfield.ts` (load warn),
  `store.ts` (persist rehydrate warn), `ErrorBoundary.tsx` (uncaught
  error), `OrbitalEngineDebugReporter.tsx` (perf stats).
- `r3f-perf` skipado: não em deps.
- Spot-check prod bundle: `grep "import.meta.env.DEV"` + `grep "IS_DEV"`
  zero hits em `dist/assets/*.js` — facade body eliminado.

**Onda 8 — resilience runtime (done Agente A, `36bb99e`)**

- `ErrorBoundary.tsx`: `fallback` aceita `ReactNode | (({error, reset})
=> ReactNode)`; state captura `error: Error | null`; `componentDidCatch`
  roteia via `telemetry.error("error", …, { error, componentStack })`.
- `src/components/utils/ErrorBoundary.test.ts` (novo, 6 casos): happy
  path, `getDerivedStateFromError`, ambos fallback contracts, `reset()`
  restaura children, log shape via telemetry.
- `useOrbitalEngine.ts`: três hooks (`useOrbitalPosition`,
  `useOrbitalCalculation`, `useOrbitalPositions`) retornam
  `OrbitalResult<T> = { state: "ready", data } | { state: "error", error }`
  ao invés de `T | null` silencioso. Try/catch centralizado em
  `resolveOrbitalResult` (pure helper) para testes sem React.
- `src/hooks/useOrbitalEngine.test.ts` (novo, 4 casos).
- `Sidebar.tsx` adapta consumer (`result.state === "ready" ? result.data : null`).
- `App.tsx`: 6× `<Suspense fallback={null}>` substituídos:
  - `<Scene />` → `<Loader />`
  - `<TutorialOverlay />`, `<CreditsModal />` → spinner centralizado
    Tailwind (`border-nasa-accent/30`)
  - `<Overlay />`, `<StarHoverTooltip />`, `<AssetStudyApp />` → ficaram
    `null` com one-line comment justificando (chrome, hover-only,
    full-page takeover).

**Onda 9a — chunking + lazy (done Agente B, `0d2e0f2`)**

- `vite.config.ts` `manualChunks`:
  - `three-vendor` (three + fiber + drei): 1 262 kB
  - `postfx` (postprocessing): 72 kB
  - `animation` (framer-motion): 124 kB
  - `state` (zustand): 7 kB
- `Scene.tsx`: `Leva` via `React.lazy` + `{debugMode && <Suspense>…}`
  (render-tree cost eliminado, mas módulo fica em Scene-\*.js por causa
  do `useControls` sync em `useSceneDebugControls` — caveat aceito).
- `Scene.tsx`: `ProceduralSun3D` via `React.lazy` + `<Suspense>`
  condicionado a `resolvedSunRenderMode === "procedural"`. Chunk
  separado: 22.6 kB + 18 kB `proceduralSurface` = ~40 kB que photo-
  mode users nunca baixam.
- **Build delta:** `index` 2 670 kB → 1 982 kB (−26%). Bulk residual é
  `astronomia` 19 MB (eagerly imported em `main.tsx`), `celestialBodies`
  data, asset manifest. Target ≤1 MB do spec não atingido; para chegar
  lá precisaria de regra para `astronomia` — deferred, não foi inventado
  fora do spec (AGENTS.md #3 + #4).
- Warning `>500 kB` ainda dispara para `three-vendor` (inerente ao
  three.js) e `index` (astronomia/data) — separately tracked.

**Verificação combinada:**

- `npm run lint`: ✅ clean.
- `npm run test:run`: ✅ 373/373 (+15 novos — 6 ErrorBoundary +
  4 useOrbitalEngine + 5 telemetry).
- `npm run build`: ✅ 7,8 s.
- Preview runtime `/atlas-orbital/`: canvas 1098×1890, 0 console errors,
  splash removido automaticamente, Sun renderiza.
- Preview asset-study `/atlas-orbital/?study=asset-review`: splash
  removido (bug 8.0 fixado), asset-study-root presente, 13 canvases
  mountados, matriz Pallas/Hygiea/Vesta/Haumea/Jupiter… renderizando.

**Arquivos tocados (batch):** 10 modificados + 5 novos = 15 arquivos.
4 commits atômicos: `5c39c0b` (8.0), `806b21f` (10), `36bb99e` (8),
`0d2e0f2` (9a).

#### Batch 2026-04-18 — Ondas 9c + 9b + 7 (paralelo)

Segundo batch paralelo: 1 inline (9c astronomia chunk) + 2 agentes
general-purpose (9b WebP, 7 Playwright + component tests).

**Onda 9c — astronomia chunk (done inline, `356106b`)**
Onda 9a deixou `index` em 1.98 MB; o resíduo era `astronomia`
(VSOP87D + ELP + Pluto-Meeus), eagerly puxado via `main.tsx →
initializeOrbitalEngine()`. Adicionado
`if (id.includes("/astronomia/")) return "astronomy"` ao `manualChunks`.
Delta build: `index` 1 982 kB → **117 kB** (−94%). Chunk `astronomy`
(1 864 kB) agora é long-term cacheable — planetary theory raramente
bumpa. Net bytes unchanged, cache hit em visitas recorrentes melhora
drasticamente. Mantido eager para não criar race em `Planet.tsx`
useFrame.

**Onda 9b — WebP pipeline (done Agente A, `891744a`)**

- `scripts/optimize-textures.js` (novo) — CLI sharp com `quality: 88`,
  mtime-skip, pessimization guard (auto-descart se `.webp` > source).
- 3 texturas convertidas (−40 MB total):
  - Oberon PNG 37.75 MB → 1.27 MB (−96.6%)
  - Mercury JPG 14.34 MB → 12.06 MB (−15.9%)
  - Moon JPG 14.33 MB → 11.58 MB (−19.2%)
- Enceladus + Tethys descartados pelo guard: sources já são JPG
  agressivamente comprimidos (16k/13k-wide apesar do prefixo
  `2k_`/`4k_`). Fallback JPG preservado, silencioso.
- Estratégia diferente do brief: as 5 texturas alvo **não** passam
  por `assetManifest.ts` — o caminho real é `textureVariants.ts`
  via `resolveTextureRequest()`. Agente adicionou helper
  `preferWebPAsset(path)` em `textureVariants.ts` com detect WebP
  uma vez + swap só para basenames em `WEBP_AVAILABLE_BASENAMES`
  (oberon, mercury, moon). Decisão correta vs. brief.
- 5 unit tests cobrindo pass-through, rewrite, unsupported-browser
  fallback.
- npm script: `textures:optimize`.
- Preview confirmado: 3× `.webp` requests 200, visual parity em
  Mercury.
- Caveat: `WEBP_AVAILABLE_BASENAMES` precisa ficar em sync com o
  que o script produz. Documentado nos 2 arquivos.

**Onda 7 — testes componente + Playwright (done Agente B, `6f57cbe`)**

- Vitest Option A (per-file pragma): `include` widened para
  `src/**/*.test.{ts,tsx}`; novos `.test.tsx` opt-in via
  `// @vitest-environment jsdom`. Config global (node) intocada.
- 3 component tests (`LayersPanel`, `SearchBar`, `Timeline`) —
  3 cases cada, 9 novos. Stub `window.matchMedia` (jsdom ausente).
- `playwright.config.ts` novo: `webServer: "npm run preview:test"`
  em porta 4174 (`--strictPort`); `reuseExistingServer` local;
  chromium only.
- `e2e/helpers.ts` porta helpers do legacy
  `scripts/phase4-regression.spec.js` (deixado em place).
- 4 specs: `boot` (full), `focus` (full — SearchBar → Mars →
  sidebar "MARS"), `quality` + `postprocessing` (`.skip()` + TODO
  porque falta hook de store/URL param pra driver deterministic).
- Dev deps novas: `@testing-library/react/jest-dom/user-event`,
  `jsdom`.
- `npm run test:e2e` verde standalone: 2 passed / 2 skipped em 52s.

**Verificação combinada:**

- `npm run lint`: ✅ clean.
- `npm run test:run`: ✅ **387/387** (373 pré + 9 component + 5 webp).
- `npm run build`: ✅ 10,1 s. `index` 117 kB (−94%), `astronomy`
  1 864 kB, `three-vendor` 1 257 kB.
- `npx playwright test`: 2 passed / 2 skipped / 52s.
- Preview runtime: canvas sized, splash dismissed, `leva=0` elements,
  WebPs servidos (3× 200, sizes coerentes), zero console errors.

**Arquivos tocados (batch):** 3 modificados + 13 novos = 16 arquivos.
3 commits atômicos: `356106b` (9c), `891744a` (9b), `6f57cbe` (7).

### Phase 3 tail — multi-epoch full coverage — 2026-04-18 session (done)

Closed the open "Phase 3 tail" checkbox below: `MULTI_EPOCH_BODIES` now
aliases `REPRESENTATIVE_BODIES` so the two lists literally cannot diverge.
All 28 bodies (27 analytical + Triton coarse-Kepler control) are now
regression-checked at 2025-01-01 / 2025-07-01 / 2026-01-01 against the
on-disk Horizons fixtures, with per-body drift envelopes in
`MULTI_EPOCH_OVERRIDES` sized from measured drift at
`max(observed × 1.15, family default)` rounded up to 2 sig-figs (L10).

Plan detail at `~/.claude/plans/come-a-atlas-orbital-distributed-gosling.md`.

**Measurement table (observed max drift across +6 mo and +12 mo):**

| Body      | Family    | Max Δ ang | Max Δ dist | Envelope (ang) | Envelope (dist) | Physical driver                                    |
| --------- | --------- | --------: | ---------: | -------------: | --------------: | -------------------------------------------------- |
| phobos    | Martian   |    165.2° |      3.02% |       **200°** |            0.04 | Mars J2 + tidal decay (P=0.32 d)                   |
| deimos    | Martian   |     17.2° |      0.01% |        **20°** |            0.02 | Mars J2 (P=1.26 d)                                 |
| io        | Galilean  |    (prev) |     (prev) |            80° |            0.02 | Laplace resonance + Jupiter J2 (pre-existing)      |
| europa    | Galilean  |      5.9° |      1.72% |       **6.8°** |            0.02 | Laplace resonance + Jupiter J2 (P=3.55 d)          |
| ganymede  | Galilean  |      1.6° |      0.01% |       **1.8°** |            0.02 | Laplace resonance + Jupiter J2 (P=7.15 d)          |
| callisto  | Galilean  |      3.2° |      0.04% |       **3.8°** |            0.02 | Jupiter J2 + mutual Galilean (P=16.69 d)           |
| mimas     | Saturnian |     46.1° |      3.62% |        **54°** |            0.05 | Tethys 2:4 resonance (P=0.94 d)                    |
| enceladus | Saturnian |    125.3° |      0.61% |       **150°** |            0.02 | Dione 1:2 resonance + tidal (P=1.37 d)             |
| tethys    | Saturnian |    108.4° |      0.10% |       **130°** |            0.02 | Mimas 2:4 resonance (P=1.89 d)                     |
| dione     | Saturnian |     35.3° |      0.04% |        **41°** |            0.02 | Enceladus 1:2 resonance (P=2.74 d)                 |
| rhea      | Saturnian |      2.0° |      0.02% |       **2.4°** |            0.02 | Saturn J2 + Titan (P=4.52 d)                       |
| titan     | Saturnian |    (prev) |     (prev) |           2.0° |            0.02 | Solar + Hyperion 4:3 (pre-existing)                |
| iapetus   | Saturnian |      1.6° |      0.10% |       **1.9°** |            0.02 | Saturn J2 + transitional Laplace plane (P=79.32 d) |
| miranda   | Uranian   |     19.0° |      0.01% |        **22°** |            0.02 | Uranus J2 × small a (P=1.41 d)                     |
| ariel     | Uranian   |      1.0° |      0.00% |       **1.2°** |            0.02 | Uranus J2 (P=2.52 d)                               |
| umbriel   | Uranian   |      3.8° |      0.02% |       **4.4°** |            0.02 | Uranus J2 (P=4.14 d)                               |
| titania   | Uranian   |      0.8° |      0.09% |       **1.0°** |            0.02 | Uranus J2 (P=8.71 d)                               |
| oberon    | Uranian   |    (prev) |     (prev) |           2.0° |            0.02 | Uranus J2 (pre-existing)                           |
| pallas    | Asteroid  |    0.007° |      0.01% | default (0.5°) |  default (0.01) | No override needed                                 |

**Shipped:**

1. `regression.test.ts` — collapsed `MULTI_EPOCH_BODIES =
REPRESENTATIVE_BODIES` (cheapest list-drift invariant); added 15 new
   `MULTI_EPOCH_OVERRIDES` entries with per-body observed drifts recorded
   in the multi-line comment block above (L10 literal); added fixture-
   completeness `it(...)` that fails with a single missing-fixture list
   instead of per-body nulls.
2. `satellites.ts` — short per-body line-comment above each overridden
   element block naming the physical driver (P + perturbation source).
3. `HANDOFF.md` line 16 — status block now says 28-body representative
   set enforced at all three epochs; Phase 3 tail flagged as closed.
4. `src/lib/orbital/README.md` — Validation section lists all 28 bodies;
   Gaps Still Open section reduced to "epoch refresh cadence"
   (process item, not code).
5. `PLAN.md` — 9 lines rewritten; Phase 4 status now "DONE"; One-Line
   Summary updated.

**Gate status:**

- `npm run lint`: ✅ clean.
- `npm run test:run`: ✅ 436/436 across 41 files (was 387/387 before;
  +49 = 48 multi-epoch × 16 bodies × 3 epochs + 1 completeness guard).
- `npm run build`: ✅ 7.97 s. Pre-existing chunk warnings only, no
  regressions.

**Known limits (AGENTS.md #8 — honesty):**

- **Every new override exceeds 2× family default.** Of the 15 new entries,
  all 15 have angular envelope > 1° (2× default). This is the honest
  signal the plan asked for, not a smell: two-body Kepler cannot track
  resonance-locked and short-period dynamics on year-scale propagation,
  full stop. The Io 80° precedent already normalized this.
- **Callisto 3.2°/yr and Iapetus 1.57°/yr** are the only "moderate-P,
  no-resonance" bodies with notable drift. Both have literature backing:
  Callisto experiences mutual Galilean perturbations (not locked into
  Laplace but still coupled); Iapetus sits in Saturn's transitional
  Laplace-plane zone where orbital element oscillations are real. Pipeline
  verified: baseline epoch is dead-on (0.000° at 2025-01-01 for every
  new body), drift rates are consistent across epochs. Not a bug.
- **Phobos 165° max is wrap-around**, not ever-growing error. Phobos
  at +6mo happens to land near antipodal to the fixture — angular
  separation saturates. The envelope (200°) is sized defensively rather
  than literally.

**Stretch (Playwright PBR smoke-test):** deferred per plan rationale.
Ondas 7 stood up Playwright infrastructure but for a different surface
(DOM/behavior); the Codex-flagged `NoColorSpace` gap may no longer exist
after ondas 9b (WebP conversion) touched the same texture pipeline.
Separate session with fresh re-read of the affected ondas would be the
cleaner path.

**Codex review prompt for the next reviewer:**

> Check the new `MULTI_EPOCH_OVERRIDES` entries (phobos…titania) against
> their paired comment line in `regression.test.ts` and the short
> element-block comments in `satellites.ts`. Verify:
> (a) the observed drift numbers in the comment match the envelope sizing
> rule `max(observed × 1.15, default)` rounded up to 2 sig-figs;
> (b) the physical-driver attribution is plausible given the period
> and parent (J2, resonance, tidal);
> (c) `MULTI_EPOCH_BODIES = REPRESENTATIVE_BODIES` doesn't mask any body
> the old 12-item list intentionally excluded;
> (d) `HANDOFF.md` / `src/lib/orbital/README.md` / `PLAN.md` doc edits
> don't contradict each other or over-claim.

### HYG v4.2 density restoration — 2026-04-17 session (done)

User reports the new HYG preset looks dramatically less dense than the
legacy tycho2 sky. Diagnosis confirmed two compound causes:

1. **Tier selection starves the render.** `hygTierForQuality()` maps
   `balanced → medium` (10 k stars) whereas tycho2 always loaded the
   full ~118 k catalog. Default `auto` mode resolves to `balanced` on
   any device with score ∈ [−1, 1] — i.e. most 2026 dev machines.
2. **Pogson shader collapses faint stars to sub-pixel.** Clamp floors
   `baseSize >= 1.5 px`, `alpha >= 0.08` at mag 6.5 kill the faint
   half of the catalog (mag ≥ 6). Old shader's linear `mix(3.0, 40.0, …)`
   - alpha floor 0.1 kept every star visibly solid.

- [x] Write plan to tasks/todo.md (L8 / CLAUDE.md literal).
- [x] **Fase 1 — shader floor + tier redistribution.**
  - [x] Raise clamps in `src/components/canvas/Starfield.tsx`:
        `baseSize` floor 1.5 → 2.5 px; `vBrightness` floor 0.08 → 0.20.
        Pogson curve intact at the bright end (mag ≤ 2 still scales
        up to 60 px).
  - [x] Redistribute `hygTierForQuality()` in `src/lib/starfield.ts`:
        `balanced → high` (50 k / 810 KB gzip) and `high → full`
        (109 k / 1.77 MB). `constrained → low` and `ultra → full`
        unchanged.
  - [x] Tier-table comment block rewritten with new payload sizes and
        rationale (density bias over bandwidth on broadband).
  - [x] `didacticBias = −0.9` re-checked under new Pogson curve — the
        1.51× size multiplier it produces matches the legacy 1.5×
        target, so no adjustment needed.
- [x] **Fase 1 — verification.**
  - [x] `npm run lint` clean.
  - [x] `npm run test:run` green — 287/287 across 30 files at
        `fae8a7a`. (Current tally 293/293 as of `aef03b8`.)
  - [x] Browser verify: fresh preview served `hyg-v1-full.bin.gz`
        (1.77 MB, ~109 400 stars) on page load, confirming the tier
        fix; rendered sky showed clearly dense faint-star field with
        visible B-V colour variation. NASA preset still loads the
        legacy asset for side-by-side visual sanity.
- [x] **Fase 2 — custom density override** — **not shipped**.
      Existing Quality control already exposes the full tier via
      `ultra`, and Phase 1 restored density for every non-constrained
      profile. Adding a separate "Starfield density" dropdown would
      duplicate that knob and widen the Settings surface without a
      user complaint to justify it (AGENTS.md #16: rationalization,
      simplest way to achieve the goal). If a real need surfaces
      later — e.g. a user with a mid-tier laptop preferring lower
      density for readability — the one-dropdown design outlined in
      the original plan remains valid and cheap to add on top.
- [x] Update review + lessons (below; `tasks/lessons.md` L11).

Deliberately **not** in scope (AGENTS.md #3 — smallest diff):
offline binary rebuild, proper-motion math, B-V curve, tilt, hover
picker, NASA renderer.

### Phase 3 — Horizons validation expansion (done)

- [x] `scripts/generate-horizons-fixtures.js` generalized (multi-body,
      multi-date, retry, preserves cross-run fixtures).
- [x] 53 fixtures across 28 bodies and 4 epochs — baseline 2020-01-01,
      mid-year 2020-07-01, one-year 2021-01-01, out-of-range 1890-01-01.
- [x] `scripts/derive-elements-from-fixtures.js` inverts fixture (r, v)
      into osculating elements. All 18 `*MeanElements` + asteroid entries
      now come from this pipeline, at epoch tagged in TDB scale so the
      engine lands at `dt=0` (see lessons L9).
- [x] Phase-4 tolerances enforced: 0.1°/0.2°/0.5° per family at baseline;
      per-body drift envelopes for multi-epoch (see lessons L10).

### Phase 3 tail (follow-on, lower priority)

- [x] Shift the analytical element epoch from 2020-01-01 to 2025-01-01
      so short-period moons (Io, Phobos, Mimas) stay within Phase-4
      tolerance at present-day simulation dates. Multi-epoch regression
      dates moved to 2025-01-01 / 2025-07-01 / 2026-01-01 to match.
      Obsolete 2020-_ / 2021-_ fixtures removed.
- [x] Expand `MULTI_EPOCH_BODIES` in `regression.test.ts` from the
      current 12 representatives to all 28 analytical bodies, with
      per-body drift envelopes in `MULTI_EPOCH_OVERRIDES` sized by
      observed behaviour. Closed 2026-04-18 — see review section above.
- [ ] Schedule an epoch refresh cadence (every 3–5 years) so drift never
      exceeds 1° at present-day simulation dates.

### HYG Starfield — in-place replacement of the legacy tycho2 preset (done)

All five sub-phases shipped:

- [x] **HYG-A** — offline pipeline (`scripts/download-hyg.js`,
      `scripts/build-hyg-binary.js`, `src/utils/hygBinary.ts`, 12 tests).
- [x] **HYG-B** — runtime migration. New shader with B-V colour, Pogson
      magnitude → size, proper motion uniform driven by simulation time.
      Store key migrated `"tycho2"` → `"hyg"`.
- [x] **HYG-C** — tier selection wired to `qualityProfile`. Constrained
      devices fetch 8 KB; ultra fetches 1.7 MB. Cache per tier so
      switching quality modes is free after first visit.
- [x] **HYG-D** — hover labels. 200 ms sustain, cursor feedback
      immediate, sidecar loaded on demand, disabled on constrained tier.
      IAU name + Bayer / Flamsteed + constellation + distance in ly.
- [x] **HYG-E** — legacy cleanup. Deleted `src/data/tycho2-processed.*`,
      `scripts/process-hyg.js`, `scripts/generate-tycho2-binary.js`,
      raw CSV. Updated credits and runtime metadata.

### Phase 5 — Deferred visual realism

- [x] Earth day/night shader fix — shipped in `abb2f6c`
      (world-space sun uniform; night-side clouds dim correctly).
- [x] Separate Earth cloud rotation from surface rotation. Cloud mesh
      and cloud-shadow caster now live in a sibling `cloudRotationRef`
      group under the axial-tilt parent, driven at
      `currentRotation * CLOUD_SUPER_ROTATION_FACTOR` (1.03). Applies to
      any body that renders a cloud layer.
- [x] PBR maps (normal / roughness) for Earth — shipped in `05ebaf7`.
      Bake pipeline at `scripts/bake-earth-pbr.js` pulls SSS CC-BY-4.0
      TIFF masters through Wayback (origin 403s scripted UA), inverts
      specular → roughness via sharp, emits 8k + 2k JPEG tiers.
      `useDeferredTexture` threaded with a `colorSpace` option so PBR
      channels sample linearly (`THREE.NoColorSpace`). Earth's
      `MeshStandardMaterial` gated on real albedo + screen salience.
      Unused `4k_ceres_fictional.jpg` (5 MB dead weight) retired in
      the same commit. Other bodies deferred to Phase 7 when
      per-body source research justifies the bake cost.
- [x] Moon-system visual regression — scoped out. WebGL pixel diffs
      are GPU-fingerprint fragile and the project has no existing
      Playwright infrastructure; baseline-PNG maintenance has a poor
      cost/benefit ratio here. Replaced in `aef03b8` with targeted
      vitest coverage: Earth PBR channel resolution (ultra/constrained
      tier selection) + Earth body-data wiring to the baked maps.

### Phase 6 — Cleanup tail (pending)

- [ ] Audit remaining scope-comments in tests (`regression.test.ts` lines
      referring to "scope of EPHASTER" etc.) — decide whether to keep as
      historical context or rewrite.
- [ ] Clarify the Playwright acceptance gate in `PLAN.md` — the current
      command fails with `ERR_CONNECTION_REFUSED` unless `npm run
preview:test` is running first. Either document the two-step flow
      or add a wrapper npm script that starts and tears down the preview.

## Review — Codex follow-up on honest port (2026-04-17)

Codex reviewed commit `3675322` and caught three things I had
missed. All valid, all fixed in this commit.

1. **DPR blindside.** My `particleSize` calculation used
   `window.devicePixelRatio`, but `Scene.tsx` clamps the renderer
   DPR via `qualityProfile.dprMax`. On a DPR-3 display under the
   constrained profile (dprMax = 1) the window DPR is 3 but the
   renderer draws into a DPR-1 buffer — my sprites were sized √3
   larger than they should have been relative to the actual buffer.
   Fix: read `gl.getPixelRatio()` inside useFrame. Applied to both
   `src/components/canvas/Starfield.tsx` and
   `src/components/canvas/NASAStarfield.tsx` (same bug was in the
   reference renderer too).

2. **Unqualified "match NASA" claim.** My Pogson-based equivalence
   (`C = 250` replacing NASA's `absMag + inverse-square` pipeline)
   is exact only for an observer local to the solar system. The
   app's Scene.tsx permits zooming well beyond that. Codex
   quantified: ~1.75 % divergence at 1000 AU for Proxima, less for
   farther stars. The practical zoom range keeps the error under
   ~2 %, but the claim had to be qualified. Added that qualification
   to the shader doc comment and to L17.

3. **Stale documentation.** Several spots in `tasks/lessons.md`
   referenced old state:
   - L15 code marker still said `useMemo(..., [gl])` — the deps are
     now `[]` after dropping the `pixelRatio` uniform.
   - L16 code marker still said `flux * 5000` and "13 tests" —
     current is `flux * 250` and 15 tests.
   - L17 only listed 3 divergences from NASA when in fact there
     were 7. Rewrote the lesson with the full list so the size
     multiplier, clamp range, alpha floor, fragment exponent, and
     the above DPR blindside are all documented.
   - `Starfield.tsx` module header still described the renderer as
     "Pogson-style size scaling" — rewrote to reflect the
     NASA-log-compressed curve it actually runs.

Codex also noted that `NASAStarfield.tsx` still uses the
`<shaderMaterial uniforms={{...}}>` JSX-child pattern flagged in
L15. That pattern is real, but NASAStarfield doesn't mutate
uniforms per-frame beyond `particleSize` — the bug L15 warns about
(GPU bindings pointing at a replaced uniforms object) fires when
per-frame mutations are routed through the stale reference. Since
NASAStarfield only writes `particleSize` and it's the same key
that re-renders in the prop, this is latent rather than active.
Deferred — will fix when we refactor NASAStarfield (it is a
comparison reference and not on the hot path anymore).

Verification: lint clean, 308/308 tests green. User to confirm
visually in the browser.

## Review — Honest NASA port (2026-04-17)

Previous "calibration pass" over-corrected and made the sky "timid
and depopulated". User pushed back: "something's very different in
the datasets that compensates for this — you're not doing a good
review of NASA Eyes' code vs ours, or you're inferring things."
Fair hit.

This commit does the side-by-side diff I should have done the first
time:

**NASA shader** (src/components/canvas/shaders/nasaStarShaders.ts):

    gl_PointSize = clamp(brightness * 4 * particleSize, 5, 50);
    fColor.a = clamp(brightness * particleSize, 0.05, 1);

**My shader, previous commit**:

    baseSize = clamp(brightness * 1.5, 2, 12);      // clamp BEFORE ×particleSize
    gl_PointSize = baseSize * particleSize * pixelRatio;  // ALSO multiplies by pixelRatio (duplicate DPR)
    vBrightness = clamp(brightness * 0.08, 0.12, 1); // coefficient 0.08, not particleSize

Three bugs:

1. **Clamp before `× particleSize`**. NASA clamps the final pixel
   value `brightness × 4 × particleSize` to `[5, 50]`. I was clamping
   `brightness × 1.5` to `[2, 12]` and _then_ multiplying by
   particleSize (~0.7), so the final range became ~`[1.5, 8.4]`.
   Stars could drop to sub-pixel instead of hitting NASA's 5 px floor.
2. **Duplicate DPR application**. `particleSize` uniform already
   includes devicePixelRatio (`sqrt(max(w,h) × DPR) / 60`); I was
   multiplying by a separate `pixelRatio` uniform on top of it.
   Retina displays got 2× the intended scaling. Added a comment on
   the `particleSize` uniform declaration so no-one repeats this.
3. **Alpha coefficient 0.08 instead of `× particleSize`**. NASA's
   alpha formula is `brightness × particleSize`, which makes every
   star brighter than mag ~5 saturate at alpha = 1. My coefficient
   0.08 crushed mag 4 to α 0.32 and mag 6 to α 0.08 (floor). The
   mid-faint band went invisible.

Changes this commit:

- `src/components/canvas/Starfield.tsx` — restored NASA's exact
  formula: `gl_PointSize = clamp(brightness × 4 × particleSize, 5, 50)`
  and `vBrightness = clamp(brightness × particleSize, 0.05, 1)`.
  Dropped the `pixelRatio` uniform entirely (no longer needed).
  Fragment `pow(d, 5)` restored (the pow(8) tweak only made sense
  under the wrong tiny-sprite calibration).
- `src/lib/starfieldShaderMath.ts` — helper now takes `particleSize`
  as a parameter and returns the final `gl_PointSize` and
  `vBrightness` values _after_ the NASA-order clamps. 13 sample
  points hand-verified against the GLSL; the previous 9 sample
  points (from the over-corrected pass) are gone.

Expected sizes at a typical `particleSize = 0.75`:

| mag           | gl_PointSize | vBrightness  |
| ------------- | ------------ | ------------ |
| -1.5 (Sirius) | 41.4         | 1.0          |
| 0 (Vega)      | 33.1         | 1.0          |
| 2             | 22.2         | 1.0          |
| 4             | 11.9         | 1.0          |
| 5             | 7.5          | 1.0          |
| 6             | 5 (floor)    | 1.0          |
| 7             | 5            | 0.50         |
| 8             | 5            | 0.22         |
| 10+           | 5            | 0.05 (floor) |

That restores the dense NASA sky: every naked-eye star (mag ≤ 6)
saturates at α 1.0 on a ≥ 5 px sprite, and the faint-telescopic
tail fades gracefully instead of dropping off a cliff.

Lesson L17 rewritten to capture the three-way bug: porting a curve
means porting _where the clamps apply_, not just the formula. The
diff I should have done the first time is now the code marker.

Verification: lint clean, 308/308 tests green. User to confirm in
browser (Playwright verification remains blocked by R3F render-loop
conflicts with screenshot stability heuristics).

## Review — NASA calibration pass (2026-04-17)

User reported the NASA-style curve from the previous commit still
rendered stars "too round and big" compared to the real NASA Eyes
visual, saying "the NASA one looks much more like the naked-eye
view of the night sky." Research subagent + my own math against
NASA's absMag + inverse-square pipeline confirmed the diagnosis:
the formula was ported correctly, but the calibration constants
were way off. NASA's effective `C` inside `log(1 + flux·C)` is
≈ 250 when you collapse the distance term for a solar-system
observer; we were running 5000 — 20× too hot.

Changes shipped:

- `BRIGHTNESS_LOG_SCALE` 5000 → 250 — matches NASA's actual
  response to apparent magnitude.
- `SIZE_COEFFICIENT` 3 → 1.5 — sub-3 px cores for all but the
  brightest stars (aligns with Celestia, tiffnix, and every
  community star-rendering write-up: production renderers use
  small sprites, not big ones).
- Size clamp [4, 40] → [2, 12] — Sirius caps at 12 px, mag 4
  stars render at ~6 px, mag 6+ fall to the 2 px floor.
- Fragment falloff `pow(d, 5)` → `pow(d, 8)` — sharper core on
  smaller sprites gives the crystalline naked-eye look instead
  of fuzzy discs.

Expected rendered sizes after the pass (vs before):

| mag           | before (px)  | after (px)   |
| ------------- | ------------ | ------------ |
| -1.5 (Sirius) | 40 (clamped) | 12 (clamped) |
| 0 (Vega)      | 40 (clamped) | 12 (clamped) |
| 2             | 33           | 11.1         |
| 4             | 24           | 5.9          |
| 6             | 15           | 2.0 (floor)  |
| 8             | 8            | 2.0 (floor)  |
| 10+           | 4 (floor)    | 2.0 (floor)  |

Test-curve cases, lint, and lesson L17 updated. 306/306 tests green.

## Review — NASA Eyes–style single curve (2026-04-17)

User didn't like the Cinematic look (too halo-y, not realistic enough)
and asked explicitly: "most realistic possible, but with density,
like NASA Eyes on the Solar System does it". We already have the
NASA Eyes renderer in-repo as a comparison reference, so the answer
was to port NASA's transfer curve to the HYG path rather than
continue tuning the Photometric/Cinematic dial.

**How NASA Eyes does it** (see `src/components/canvas/shaders/nasaStarShaders.ts`):

- Logarithmic brightness compression: `brightness = 2·log(1 + flux·C)`.
  Matches the eye's response (Fechner's law), so bright stars saturate
  gently and faint stars stay usable instead of collapsing.
- Size and alpha both scale with the SAME log-compressed brightness
  (no separate curves) — ordering is preserved by construction.
- Floors at ~5 px / 0.05 α so the faint tail stays visibly present
  but does not flatten into haze.
- Sharp `pow(d, 5)` fragment falloff — crisp dots, no halo, no bloom.

**What we shipped:**

- **`src/components/canvas/Starfield.tsx`** — replaced the whole
  Photometric/Cinematic transfer machinery with one NASA-style
  curve:
  - `flux = 10^(-mag·0.4)` (Pogson apparent-mag flux, ratio form)
  - `brightness = 2·log(1 + flux·5000)` (Fechner log compression)
  - `baseSize = clamp(brightness·3, 4, 40)`
  - `vBrightness = clamp(brightness·0.08, 0.12, 1)`
  - `alpha = pow(d, 5)` in the fragment — sharp dot, no halo
- **`src/lib/starfieldShaderMath.ts`** — TS mirror rewritten to
  match the single curve. No `styleMix` / compression / lift
  window any more. 13 unit tests cover bright-end clamp, faint-tail
  floor, strict monotonicity end to end (log is monotonic by
  construction — no more "hump" to defend), and 9 hand-verified
  sample points across mag −1.5 → 20.
- **`src/store.ts`** — removed `starfieldStyle` field, setter, and
  localStorage key (`starfieldStyle`). State surface shrinks back
  to where it was before the Cinematic experiment.
- **`src/components/ui/LayersPanel.tsx`** — removed the Starfield
  Style subsection. The panel is back to Starfield Source + Scale
  Mode + Quality + Sun Render.
- **`src/components/ui/controlPanelConfig.ts`** — removed
  `SCENE_STARFIELD_STYLE_OPTIONS`.

**Why this is better than Cinematic:**

- Realistic by construction: NASA Eyes uses this exact shape; the
  sky reads like their renderer does.
- Dense by construction: the 4 px / 0.12 α floor keeps every
  surviving HYG star on screen without a haze-inducing hard
  floor at the top of the alpha curve.
- No toggle complexity: one curve, no per-profile branching, no
  mode-specific maths. The previous Photometric/Cinematic split
  was trying to solve two problems (honesty + density) with a
  binary switch; log compression solves both at once.
- Preserves our catalog advantages: B-V colour, proper motion,
  tier selection all still apply on top.

**Why we dropped the Cinematic mode entirely rather than keeping
it as an option:**

- User feedback was "didn't like the result". Shipping an option
  the user actively rejected is not a "give them a choice" win —
  it's surface area.
- The NASA curve already behaves like what the user actually wants
  when thinking of "realistic + dense". No second mode to toggle.
- Less code (~100 lines removed) means one fewer surface for
  future reviewers to audit.

**Tooling note:** visual verification via Playwright CLI kept
hanging on screenshot capture — R3F's continuous render loop
conflicts with Playwright's "stable" heuristic. Unit tests pin the
math; end-to-end "does this look right" now requires the user or a
headed browser. `tasks/lessons.md` gains a note on this.

Verification: `npm run lint` clean, `npm run test:run` 305/305
green (8 cinematic-era tests deleted, 13 new single-curve tests
added).

## Review — cinematic actually visible now (2026-04-17)

User reported that flipping Photometric/Cinematic did nothing on
screen, while Scale Mode (didactic/realistic) clearly changed star
sizes/brightnesses. That asymmetry was the clue: geometry attributes
(biasedMag rebuild on scaleMode) propagated to the GPU, but uniform
values (styleMix) did not.

Empirical verification via Playwright CLI (`debug-toggle.mjs`, now
deleted): toggling the style changed **0.06 %** of the rendered
pixels with the original pattern — essentially noise. After fixes
below, the same toggle changes **0.55 %** of pixels (≈ 6300 visibly
different pixels across the sky), which is what a user can actually
see.

**Root cause:** the JSX `<shaderMaterial uniforms={{...}}>` child
pattern recreated the entire `uniforms` object on every parent
render. R3F then called `material.setValues({ uniforms: newObj })`,
which swapped the whole uniforms map. Per-frame writes in `useFrame`
then mutated a detached object that the compiled WebGL program no
longer read from. The compiled program still had `styleMix` as a
declared uniform, but its binding pointed at the original uniforms
object, which was stale.

**Fixes shipped:**

- **`src/components/canvas/Starfield.tsx`** — build the
  `ShaderMaterial` explicitly via `useMemo` and pass it as
  `material={material}` on `<points>`. The uniforms map is created
  exactly once and never swapped, so per-frame mutations reach the
  GPU reliably. The vertex-stage `vColor = bvToRGB(ci)` line is
  restored (a temporary red-tint debug line proved the uniform path
  was broken — user literally saw every star turn red in cinematic
  while the debug was active, which was the data that unlocked the
  diagnosis).
- **Strengthened cinematic defaults** so the visible difference
  reaches users, not just pixel-diff tools:
  - `SIZE_BOOST_CINEMATIC`: 1.8 → 2.5 (larger sprite)
  - `FALLOFF_POW_CINEMATIC`: 9 → 2 (softer halo instead of tighter
    core — the previous value narrowed the core at the same time
    the sprite grew, leaving the net visual almost unchanged)
  - `CINEMATIC_FLAT_ALPHA_BUMP`: 0.03 → 0.10 (dimmest stars stop
    blinking in/out of sub-pixel visibility during slow pans)
  - Comments in `Starfield.tsx` rewritten accordingly.
- **`src/lib/starfieldShaderMath.ts` + tests** updated with the new
  constants. Cinematic sample values rebuilt from the new curve;
  the monotonicity-outside-window test split into "below mag 6" and
  "above mag 12" because the flat alpha bump makes the above-12 tail
  a gentle descent rather than a flat floor.

**Tooling note:** started using Playwright CLI via
`node debug-toggle.mjs` for pixel-diff verification, as the repo's
AGENTS.md mandates. The Claude preview MCP was too brittle (repeated
L11 0 × 0 iframe bug, stale HMR programs) for visual regression of
this kind. Pure-TS shader-math tests pin the numerical curve; real
browser pixel-diffs pin the end-to-end rendering. Next time a
shader-uniform bug comes up, jumping straight to Playwright saves a
lot of time.

Verification: lint clean, 313/313 tests green (20 shader-math +
293 prior). Playwright pixel-diff confirms ~0.55 % of pixels change
when toggling — visible to the user on a real monitor. The 4 Codex
findings from the earlier review iteration are all still addressed
(ordering fix, honest bright-end comment, NASA-source guard, pinned
mapping tests).

Lesson L15: "attribute changes reach the GPU via geometry rebuild,
uniform value changes go through the material's uniforms map —
replacing that map with a new object on each render silently
decouples per-frame writes from the compiled program's bindings.
Use a stable `useMemo`'d ShaderMaterial + `<points material={...}>`
for anything with per-frame uniforms."

## Review — Cinematic toggle + third Codex follow-up (2026-04-17)

Shipped the Photometric/Cinematic toggle designed earlier in the
session, then fielded a third Codex review after the user reported
no perceived difference between modes. Codex caught three issues, all
confirmed correct. Two were fixed; the third was a documentation
lie fixed in the comment without changing math.

**What the toggle does (final form):**

- `styleMix ∈ [0, 1]` uniform driven by `starfieldStyle` store field
  (persisted in localStorage, default `cinematic`). Photometric is
  exact identity to the previous shipped shader; cinematic adds
  three coordinated effects:
  1. Magnitude compression for `mag ≥ 6` — pulls the faint tail
     toward the naked-eye anchor, so the Pogson curve on
     `compressedMag` gives meaningful flux to stars the eye would
     otherwise lose.
  2. Sprite enlargement (`×1.8`) — applied globally to kill
     sub-pixel flicker during slow camera pans. Comes with an
     honest trade-off: bright stars do gain about 25–35% extra
     additive screen energy even after the sharper fragment
     falloff compensates. That is an intentional perceptual gain,
     not strict photometric invariance.
  3. Fragment falloff `pow(5 → 9)` — sharpens the sprite core so
     the enlarged sprite still reads as a point of light, plus a
     small flat `+0.03 α` bump so the dimmest stars stay visible
     during slow pans.

**Codex findings + resolutions:**

- **P2 — Ordering inversion (fixed).** The lift was running on
  `compressedMag` instead of raw `mag`. Codex verified: in cinematic,
  raw mag 12 compressed to 8.4 landed at the lift peak (`faintLift = 1`),
  while raw mag 7.5 compressed to 6.6 sat at the ramp
  (`faintLift ≈ 0.352`). Result: dim survey stars out-brightened
  binocular stars. Fixed by driving the smoothstep from raw `mag`,
  so the window stays anchored to the actual naked-eye limit.
  Regression pinned by a unit test in `starfieldShaderMath.test.ts`.
- **P2 — "Bright end preserved" was a lie (comment fixed, math
  kept).** Compression is gated to `mag ≥ 6`, but `sizeBoost`,
  `falloffPow`, and the flat `+0.03 α` bump apply to every star.
  Codex integrated the fragment profile and measured `~1.24×` extra
  energy on mag 3 in cinematic even after the sharper falloff
  compensates. The math is intentional — cinematic is supposed to
  lift overall presence, not just the faint tail — but the comment
  was claiming invariance it did not deliver. Rewrote the comment to
  say what actually happens and why it's a feature, not a bug. Math
  unchanged.
- **P3 — NASA source no-op (fixed).** The toggle lived in the Scene
  panel unconditionally, but only `<Starfield />` (HYG) reads
  `starfieldStyle`. `<NASAStarfield />` ignores it. When the user
  flipped to NASA source and toggled styles, nothing happened.
  Fixed by conditionally rendering the "Starfield Style" subsection
  only when `starfieldSource === "hyg"`.

**New test coverage (`starfieldShaderMath.test.ts`, 20 tests):**

Extracted the full per-star transfer curve into a pure TS helper
`starfieldPointMetrics(mag, styleMix)` that mirrors the GLSL vertex
stage exactly. Tests now pin:

- `styleMix = 0` identity (no regression of the photometric baseline)
- Cinematic sample values at 7 hand-verified magnitudes
- Codex Finding 1 regression: `mag 7.5 > mag 12` in cinematic
- Strict monotonicity outside the lift window (`mag < 6`, `mag > 12`)
- Documented invariant: the lift window intentionally creates a
  local maximum at mag 7.5 above mag 6 — perceptual design choice,
  present in both modes, NOT a bug

**AAA rendering backlog (from parallel research subagent):**

Research agent surveyed modern AAA space-game pipelines (Elite
Dangerous, Star Citizen, No Man's Sky, Starfield, EVE Frontier) and
the 2026 Three.js / R3F ecosystem. Items prioritized by ROI:

- [ ] **HDR + tone-mapped selective bloom.** Highest ROI. Pattern:
      `ACESFilmicToneMapping` + `<EffectComposer>` with `<Bloom
mipmapBlur luminanceThreshold={1.0} intensity={0.6}>` via
      `@react-three/postprocessing`. Bright stars emit colours
      above 1.0 in the fragment shader; the Bloom pass picks them
      up selectively. Hours to days of work. Confirmed by multiple
      Digital Foundry breakdowns as "the" space-scene unlock.
- [ ] **Milky Way + zodiacal light layer.** Equirect ESO/Gaia
      public-domain texture on a large inverted sphere, rendered
      beneath the star catalog but beneath the bloom pass too, so
      bright stars still punch through. Adds real "depth" — the
      faint dust continuum instead of black void. Day of work.
- [ ] **Per-star lens flare on mag ≤ 0 stars** (Sirius, Canopus,
      Arcturus, Vega, Rigel). Star Citizen-style anamorphic
      streaks on the brightest catalogue entries. Tricky: existing
      `@andersonmancini/lens-flare` is designed for one sun-like
      source; multi-instance needs custom billboards + pre-baked
      anamorphic texture. Day of work.
- [ ] **Sprite-size floor for sub-pixel stability — SHIPPED** in
      the Cinematic mode above. Research agent independently listed
      it as recommendation #4; we got it for free as the flicker
      fix.
- [ ] **WebGPU + TSL compute path.** Deferred. Three.js WebGPU is
      production-ready as of r171 (Sept 2025) but at 109k static
      points we are nowhere near the bottleneck that justifies the
      rewrite. Revisit when animated nebulae or dust particles
      land.

**What we already do well (research confirms):**

- Catalog-accurate B-V colour + Pogson magnitude + proper motion
  puts us ahead of drei's `<Stars>` (random, count=5000) and the
  widely-cited EVE Frontier demo (which uses `MeshBasicMaterial +
setColorAt` on an `InstancedMesh`).
- Single `THREE.Points` + custom GLSL at 109k stars is still the
  right 2026 pattern for non-interactive points. EVE Frontier only
  went `InstancedMesh` because they wanted per-instance raycast
  picking — a constraint we don't have.
- Tiered quality profile (500 / 50k / 109k) matches what Flight
  Sim 2024 community fixes and Starfield patch notes flag as the
  primary mobile/low-end lever.

Verification: `npm run lint` clean, `npm run test:run` 313/313
green (20 new shader-math tests + 293 previous). Browser preview
still hits the L11 iframe 0 × 0 bug, so side-by-side visual
validation of Photometric vs Cinematic in ultra remains the user's
to confirm in a real browser.

Lesson L14: "Transfer-curve inputs must stay anchored to the
physical axis (raw mag) — running a perceptual lift on a
compressed domain lets the lift land on the wrong stars and
invert cosmic ordering."

## Review — graduated faint-star lift (2026-04-17)

Second Codex review, after the user reported the corrected sky felt
"a bit less dense". Codex's core diagnostic was right: any density
change between `fae8a7a` and `60cb1fa` in ultra can only come from
the shader (both commits map ultra → full → 109 400 stars). The
pre-fix `1.5 px / 0.08 α` floor is honest Pogson but visually
conservative; the `fae8a7a` hard floor at `2.5 px / 0.20 α` fixed
density by flattening the catalogue's ordering, which was worse.

Where I agreed with Codex:

- Drop the "50 k saturates perceived density" comment — user feedback
  contradicts it, and the real reason `high → high` stays is LOD
  ladder preservation, not a density claim. Rewrote the comment.
- Use a graduated lift in a narrow magnitude window rather than a
  hard global floor.
- Keep bright end pure Pogson (untouched).

Where I pushed back:

- **Per-profile shader uniforms** (Codex recommendation 3) — overkill.
  A single smoothstep window naturally scales across profiles: in
  balanced/high (tier max mag ~8.3) the lift fully covers the tail
  it has; in ultra (max mag ~20.5) the same window gives the
  naked-eye-to-binocular band presence while the telescopic tail
  (mag > 12) fades back to the raw floor and stays ghostly.
- **Core/halo split** (recommendation 6) — adds a second draw call
  or overdraw for a ~10 % perceptual gain over a good transfer
  curve. Park for a future "AAA mode" if and when density still
  feels short after this curve lands.

Shipped this round:

- **`src/components/canvas/Starfield.tsx`** — replace the 60cb1fa
  bare-Pogson + `1.5 / 0.08` floor with a smoothstep-window lift
  centred on shader mag ≈ 7.5. Size gets up to +1 px in the window,
  alpha up to +0.12. Window opens at mag 6, peaks at mag 7.5, fades
  back out by mag 12. Comment block rewritten to lay out _why not a
  flat floor_.
- **`src/lib/starfield.ts`** — header comment rewritten to drop the
  "50 k saturates perceived density" hypothesis (noted as wrong by
  Codex and by user feedback) and to name the real driver of
  perceived density (the shader transfer curve). Tier mapping
  unchanged.

Verified curve ordering by hand (key points, realistic mode):

| realmag | size px (60cb1fa) | size px (new) | Δ                    |
| ------- | ----------------- | ------------- | -------------------- |
| 5       | 4.99              | 4.99          | 0 (bright untouched) |
| 6       | 3.15              | 3.15          | 0 (window not open)  |
| 6.5     | 2.50              | 2.76          | +0.26                |
| 7.5     | 1.58 → 1.5 floor  | 2.58          | +1.00 (peak)         |
| 8.3     | 1.09 → 1.5 floor  | 2.09          | +0.59                |
| 10      | 0.40 → 1.5 floor  | 1.5           | 0 (fade kicking in)  |
| 12+     | sub-pixel → 1.5   | 1.5           | 0 (telescopic ghost) |

Monotonic across the whole range — no flattened buckets. The faint
naked-eye band (6.5–8.3) goes from "on the floor" to "clearly
visible with gradient", which is the density the user felt missing.
In `ultra` the full-tier population above mag 12 stays at the raw
`1.5 / 0.08` floor, so the catalogue does not turn into haze.

Verification: lint clean, 293/293 tests green (no regressions). The
browser preview is still pinned by L11 (iframe hosts a 0 × 0
viewport that blocks R3F canvas sizing); side-by-side screenshot
comparison in ultra will need to happen outside the Claude preview
MCP. User-facing visual acceptance remains open until the user or a
headed Playwright run confirms the lift looks right.

Lesson L13 (tasks/lessons.md): "global hard floors hide magnitude
ordering; graduated smoothstep windows are the right tool for
perceptual lifts inside a physics-informed transfer curve."

## Review — Codex follow-up on density fix (2026-04-17)

Independent Codex review of commit `fae8a7a` flagged three issues, all
confirmed correct after verifying the math and re-reading the paths:

1. **Shader floor change did not address the reported cause.** The old
   `1.5 px` floor activates at shader-mag ≥ 7.61; the old `0.08 α`
   floor at shader-mag ≥ 6.5. The complaint came from
   `auto → balanced → medium` (max real-mag 6.6) with default
   scaleMode `didactic` applying a `−0.9` bias — so the shader saw
   max mag ≈ 5.7, well below both floors. Zero stars in the reported
   case hit either floor. The shader edit was orthogonal to the
   user's complaint.
2. **The new `2.5 px / 0.20 α` floor destroyed magnitude ordering.**
   Floors now trigger at shader-mag ≥ 6.5, i.e. real-mag ≥ 7.4 in
   didactic mode. For the `high` tier (to mag ~8.3) that flattens
   ~80 % of stars to the same dot; for `full` (to mag ~20.5) it
   flattens ~90 %. The observable effect: a uniform haze of
   telescopic stars at the same visual weight as naked-eye stars.
3. **Tier remap collapsed the LOD ladder.** With `high → full` and
   `ultra → full`, the `ultra` profile no longer earns its extra
   payload over `high`. Plus `balanced` (score ∈ [−1, 1]) is genuine
   mixed hardware — 4 GB / 8-thread / 3G devices land there per
   `qualityProfile.test.ts:43`. 5× more stars means 5× decode,
   geometry build, and GPU upload, not just 5× network.

Corrections shipped in `60cb1fa`:

- **`src/components/canvas/Starfield.tsx`** — shader floors reverted
  to `1.5 px / 0.08 α` so the Pogson curve preserves magnitude
  ordering all the way out to mag 20. Comment block trimmed and
  reframed to explain _why the floor stays low_ (fog avoidance) so
  future maintainers do not walk back into the same trap.
- **`src/lib/starfield.ts`** — partial revert: `balanced → high`
  kept (this is the real fix for the complaint), `high → full`
  reverted to `high → high` so `ultra → full` stays the opt-in
  ceiling. Header comment rewritten accordingly.
- **`src/lib/starfield.test.ts`** — four unit tests pin
  `hygTierForQuality()` mapping (constrained→low, balanced→high,
  high→high, ultra→full). Next time someone shuffles the mapping,
  CI catches it without needing a human review round.

Verification: `npm run lint` clean; `npm run test:run` 291/291 green
(4 new, +0 regressions). Browser verify blocked by L11-style iframe
with 0x0 viewport (R3F cannot mount a sized canvas under a headless
preview); unit tests cover the decision logic directly.

Lesson: `tasks/lessons.md` L12 — "don't bundle two changes as one
fix; prove each addresses the reported cause independently".

## Review — HYG density restoration (2026-04-17 continuation)

Follow-up after the density complaint. Phase 1 shipped two surgical
changes; Phase 2 was consciously skipped.

- **`src/components/canvas/Starfield.tsx`** — shader vertex stage
  floors raised: `baseSize` clamp `1.5 → 2.5 px`, `vBrightness`
  clamp `0.08 → 0.20`. Expanded the adjacent comment block to
  explain the physical motivation (atmospheric PSF, glare, pupil
  adaptation) so a future reader does not "optimise" the floors back
  down. Pogson curve unchanged at the bright end.
- **`src/lib/starfield.ts`** — `hygTierForQuality()` remapped:
  `balanced → high` (was `medium`), `high → full` (was `high`).
  `constrained → low` and `ultra → full` unchanged. Comment header
  rewritten so the mapping's rationale (density bias over bandwidth
  on modern broadband) is visible at the call site.

Phase 2 (a per-subsystem "Starfield density" dropdown in the Settings
panel, mirroring AAA per-subsystem controls) was evaluated and
dropped: the existing Quality control already exposes the full tier
via `ultra`, so the new dropdown would duplicate that knob. Keeping
the Settings surface small is a more honest fix than adding a second
density control with a different label.

Verification:

- `npm run lint` clean.
- `npm run test:run` 287/287 green across 30 test files at `60cb1fa`.
  (Current tally 293/293 as of `aef03b8`.)
- Fresh preview instance confirmed `hyg-v1-full.bin.gz` (1.77 MB,
  ~109 400 stars) served on page load — i.e. the tier remap is live
  — and the rendered sky shows faint stars visibly resolved with
  B-V colour variation.

Note (AGENTS.md #8, honest limits): a genuinely constrained device
still gets the 500-star low tier with no in-app override. That is
intentional — the low tier exists for phones and 3G links that
cannot carry the full 1.77 MB payload — but a user with a mid-tier
laptop who prefers lower density for readability has no UI knob to
request it short of flipping Quality to `constrained`, which also
downgrades shadows and shader passes they may want to keep. If that
becomes a real request, the Phase 2 dropdown design stays on file.

Lessons: `tasks/lessons.md` L11 — Vite HMR state accumulates across
in-session edits; the Claude preview can look "stuck at 8%" when
the actual problem is a client-side `BOOT_STAGE` that never advances
because eight vite WebSocket clients are now fighting over the same
R3F canvas. Fix: `preview_stop` → `preview_start` flushes it.

## Review — 2026-04-17 session

Shipped after the pre-session baseline (commits top-to-bottom, oldest
first):

1. **Earth cloud day/night shader** (`feat(planet)…`, `abb2f6c`) —
   world-space sun uniform so the night side dims correctly.
2. **Real offline analytical ephemeris stack** (`feat(orbital)…`,
   `bbec355`) — VSOP87D, Pluto-Meeus, ELP/MPP02-trunc, satellite +
   asteroid modules. Consolidates Kepler math in `coordUtils.ts`,
   removes dead code, 15 new unit tests, honest provenance throughout.
3. **Multi-epoch Horizons regression** (`test(orbital)…`, `9279424`) —
   generalises `generate-horizons-fixtures.js`, expands regression
   suite to cover multi-epoch drift + validity-window routing.
4. **Fixture-derived satellite / asteroid elements** (`fix(orbital)…`,
   `fe23150`) — new `scripts/derive-elements-from-fixtures.js` inverts
   Horizons (r, v) into osculating elements. Fixes 50–170° satellite
   errors and the 72° Pallas error. Catches UT-vs-TDB epoch mismatch
   (L9).
5. **HYG v4.2 binary pipeline (offline)** (`feat(starfield)…`,
   `e4994c3`) — HYG-A. Spec, downloader, LOD-tier builder, 12 tests.
6. **First Codex review follow-up** (`fix(orbital)…`, `85bafe9`) —
   orbit lines now consume analytical osculating elements; credits +
   registry notes aligned with Horizons-derived reality; task log
   refreshed; Playwright gate clarified in PLAN.md.
7. **HYG runtime migration** (`feat(starfield)…`, `8035770`) — HYG-B.
   New shader with B-V colour, Pogson size, proper motion uniform.
   Store key `tycho2` → `hyg`.
8. **HYG tier selection** (`feat(starfield)…`, `f455f7a`) — HYG-C.
   `qualityProfile` → tier mapping; cache per tier.
9. **HYG hover labels** (`feat(starfield)…`, `188ba31`) — HYG-D.
   200 ms sustain tooltip, cursor feedback, disabled on constrained.
10. **Legacy tycho2 pipeline deleted** (`chore(starfield)…`,
    `d872104`) — HYG-E cleanup.
11. **Analytical epoch shift 2020 → 2025** (`fix(orbital)…`, `a7fe539`)
    — re-derives every satellite/asteroid entry from fresh Horizons
    fixtures at 2025-01-01 so short-period moons stay under Phase-4
    tolerance at present-day simulation dates. 84 new fixtures, 52
    obsolete ones removed, `MULTI_EPOCH_DATES` bumped to 2025 / 2025-07
    / 2026.
12. **Second Codex review follow-up** (`fix(orbital)…`, `30994e8`) —
    fixes the hover-picker catalog race that could keep
    tooltips disabled on first load, bumps
    `generate-horizons-fixtures.js` default dates to the 2025 set,
    aligns CreditsModal and task log to the current epoch.

Code quality checkpoints:

- `AGENTS.md` principles applied literally: no dead code after each
  strategy change, no duplicated Kepler solvers, honest provenance,
  no invented file references.
- Two rounds of independent Codex review, both acted on in the
  commit that immediately follows. `tasks/lessons.md` carries the L1-L10
  rule set derived from everything this session caught.
- Browser smoke test (preview mcp) confirmed zero runtime errors,
  hover tooltip working, tier selection auto-resolving, all textures
  loading.

Known remaining limits, surfaced explicitly (AGENTS.md #8):

- Multi-epoch drift for fast-moving satellites is real and bounded,
  not hidden: Io ±80° /yr, Titan / Oberon ±2° /yr. Encoded in
  `MULTI_EPOCH_OVERRIDES` with physical cause.
- `MULTI_EPOCH_BODIES` in `regression.test.ts` still only covers the
  12 original representatives. The 2025-07-01 / 2026-01-01 fixtures
  for the remaining 16 bodies are on disk but not yet held to tight
  multi-epoch tolerance (tracked in "Phase 3 tail").

Verification status: `npm run lint` clean, `npm run test:run` at
287/287 green across 30 test files, `npm run build` ~9 s — as of the
10-commit session that closed at `ae2a2a3`. Subsequent sessions pushed
this to 293/293 across 30 files (current as of `aef03b8`).

---

### Research — Lighting & VFX AAA roadmap (2026-04-18)

Research + architecture session, **zero production code changed**.
Three markdown deliverables produced (the factual foundation for all
future visual work; downstream sessions execute against these):

- [tasks/lighting-audit-current.md](./lighting-audit-current.md) — exhaustive
  file:line inventory of every light, material, post pass, starfield
  shader, orbit/halo/cloud path, quality-profile gate, and asset slot.
  Flags the latent double-tone-map in `Scene.tsx:267` vs
  `PostProcessingPipeline.tsx:68`.
- [tasks/lighting-aaa-benchmark.md](./lighting-aaa-benchmark.md) —
  ~70-URL benchmark covering AAA space games (Elite Dangerous, Star
  Citizen, Starfield, NMS, Universe Sandbox 2, SpaceEngine, Celestia,
  KSP2, EVE) and the 2026 R3F ecosystem (drei / postprocessing /
  realism-effects / n8ao / `@takram/three-atmosphere` / ektogamat /
  sbcode TSL). Claims with thin sourcing marked `[unverified]`.
- [tasks/lighting-backlog.md](./lighting-backlog.md) — **primary
  deliverable**. 13 items ranked by ROI, each with 7 honest fields
  (summary / visual impact / implementation sketch / dependencies /
  risks / LOC-sessions / gating). Opens with **Rendering Invariants**
  (tone-mapping authority, exposure authority, HDR-emissive contract,
  backdrop-vs-IBL separation) and **Settings model** (preset ↔ custom
  coexistence, graded control states). Includes dependency matrix
  and cross-reference to the prior AAA rendering backlog block in this
  file (~:1567-1599).

Plan file: `~/.claude/plans/come-a-atlas-orbital-replicated-candle.md`.
Codex review integrated before finalizing the plan (7 architectural
contributions: pipeline authority contract, item split for HDR/star
recalibration, settings-model extension vs green-field infra, Milky Way
reclassified as experimental/backdrop-only, atmosphere schema as data-
model work, graded control states, dependency-surface precision).
