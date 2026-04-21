# Phase θ — Gaia Sky port status

**Single source of truth for where we are in the Gaia Sky visual port.**
Read this first before touching shader / VFX code.

_Last updated: 2026-04-21 (after `fdb66ae` de-drift pass on θ.3)._

---

## For a fresh agent picking up mid-phase

Read in this order:

1. `AGENTS.md` (repo root) — engineering standards.
2. `CLAUDE.md` (repo root) — workflow orchestration rules.
3. `~/.claude/projects/.../memory/MEMORY.md` — behavioral rules (index).
4. **This file** (`tasks/STATUS.md`) — what's shipped, what's next.
5. `tasks/phase-gaia-sky.md` — the full Gaia Sky port spec (1500+ lines).
   §4 = tier / reduced-motion contract. §5 = per-onda port plans.
   §8 = sequence table. §9 = out-of-scope.
6. `tasks/lessons.md` — cross-cutting engineering lessons.

After reading, the next-action bullet under **"→ Next up"** below tells
you exactly what to do.

---

## Shipped ondas

| Onda                               | Shipped                 | Commits                                                                                           | What it delivers                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **θ.1** — Star sprite kernel       | 2026-04-20              | `2662f08`, `13e501e`                                                                              | Gaia fragment kernel: gaussian halo texture + razor white core via `smoothstep(0.0, 0.04, r)` on premul additive blend                                                                                                                                                                                |
| **θ.1b** — Vertex solid-angle port | 2026-04-20 → 2026-04-21 | `22349b0`, `583268e`, `07606be`, `0131af0`, `54e14ca`, `f8d8bff`, `8668b20`, `9b13f18`, `0961591` | Pseudo-size `a_size` from absMag + `solidAngle = a_size/dist` + `lint_smoothstep` opacity + `degrees12/radians12` precision + `[minQuad, 3e-8]` clamp + billboard-quad rendering + full Gaia color pipeline (Ballesteros→xyY→XYZ→γRGB +0.16 HSV) + fragment saturate                                  |
| **θ.3** — LightGlow post-process   | 2026-04-21              | `a27dc42`, `fdb66ae`                                                                              | `lightglow.frag.glsl` port as pmndrs Effect: Archimedean-spiral luma gate + polar-mask time-animated halo on top-N HYG billboard stars. Sun NOT in registry (Gaia: Sun is planet/model, not HIP-billboard). FOV-factor aware. Reduced-motion gates the mount. Runtime `nSamples=1` override honoured. |

---

## → Next up: **θ.1c — Star billboard motion trails**

**Status**: pending, ready to start.
**Effort**: M (estimated ~200-400 LOC).
**Plan section**: `tasks/phase-gaia-sky.md §5 θ.1c` (line 622).
**Dependency**: θ.1b's `quadSize` path is stable (shipped).

**Scope summary**: port Gaia Sky's `billboard.stretch.glsl` snippet. The
current billboard-quad mesh (shipped in θ.1b closure `0961591`) is flat
screen-aligned. θ.1c adds the stretch along the camera velocity vector
so stars leave a subtle motion trail during fast camera panning /
cinematic moves — the characteristic "streaking" look in Gaia Sky when
you zoom through space.

**Gaia Sky source to read first (R1 protocol)**:

- `/tmp/gaiasky/assets/shader/snippet/billboard.stretch.glsl` — the
  stretch math itself (camera-relative up/right vectors, velocity
  projection, quaternion blend).
- `/tmp/gaiasky/core/src/gaiasky/scene/system/render/draw/StarSetInstancedRenderer.java`
  — where the stretch snippet is `#include`-d into the star shader.
- Whatever uniform feeds `u_camVel` and `u_dt` — Gaia's camera velocity
  tracking lives in `CameraManager`.

**Atlas-side surface expected**:

- `src/components/canvas/Starfield.tsx` — inline the stretch snippet
  into the θ.1b vertex shader OR add a second attribute pass.
- New module for camera-velocity tracking if θ.8's "camera feel" hasn't
  shipped yet (it hasn't — still pending).
- Reduced-motion gate hard-off (§4.2) — stretch trails are clearly
  motion-sensitive.

---

## Pending sequence after θ.1c

Order from `phase-gaia-sky.md §8` (post-θ.3-ship):

| #   | Onda | Subsystem      | Effort | Notes                                         |
| --- | ---- | -------------- | ------ | --------------------------------------------- |
| 1   | θ.1c | Star vertex    | M      | Billboard motion-trail stretch (NEXT)         |
| 2   | θ.6  | Composer       | S      | Grading finishes (CA + vignette + film grain) |
| 3   | θ.9  | Scene-graph    | M      | Orbit-lines glow shader                       |
| 4   | θ.10 | Scene-graph    | M      | Constellations lines + MSDF labels            |
| 5   | θ.12 | Scene-graph    | S      | Named star labels via troika                  |
| 6   | θ.8  | Camera         | M      | Cinematic damping + FoV easing + surfaceMode  |
| 7   | θ.5  | Composer+Depth | M      | Camera motion blur (velocity-based)           |
| 8   | θ.4  | Composer       | M-L    | Pseudo lens flare + lensdirt starburst        |
| 9   | θ.15 | Composer       | M      | NFAA + FXAA + LumaSharpen (no SMAA)           |
| 10  | θ.14 | Star vertex    | S      | Alive-sky twinkle (depends on θ.1b)           |
| 11  | θ.11 | Backdrop       | M-H    | Milky Way cubemap + dust                      |
| 12  | θ.7a | Hero-LOD       | M      | Hero-star corona billboard                    |
| 13  | θ.7b | Hero-LOD       | L      | Procedural surface + cross-fade               |

Canonical full table (with tier visibility, ship-order rationale, and
notes per onda) lives in `tasks/phase-gaia-sky.md §8`.

---

## Ship-protocol contract (user's standing requirement)

Every onda ships through this loop (applies to θ.1c too):

1. **R1 source-read** — clone + read Gaia Sky `.glsl` / Java files for
   the onda. No plan-prose shortcuts.
2. **Implementation** — port 1:1 with documented intentional
   divergences (HDR, atlas architecture choices).
3. **Self-check** against source — catch own drift before Codex does.
4. **Gates** — `npm test -- --run`, `npm run lint`, `npm run build`.
5. **Runtime smoke** — Claude-Preview MCP, screenshot, verify no
   shader errors in console.
6. **Codex audit** — fire `codex exec --sandbox read-only` with a
   focused prompt (see `tasks/codex-review-theta-3-prompt.txt` for
   the template).
7. **Verify Codex findings independently** — each claim split into
   (a) direction from source, (b) execution match. Procedural
   substitutes for Gaia `$GS_DATA` assets are underspecified —
   pick conservative fallbacks. See
   `memory/feedback_codex_verified_claims_can_still_drift.md`.
8. **Fix legitimate findings**, reject drift suggestions.
9. **Commit** with detailed message referencing source files.
10. **Update `tasks/STATUS.md`** (this file) and `tasks/phase-gaia-sky.md
§8` with the new SHIPPED row + commit SHAs.
11. **Update `memory/`** with any new lesson.

---

## Out-of-scope (documented, not pending)

Tracked in `tasks/phase-gaia-sky.md §9`:

- **θ.2** — merged into θ.4 (Gaia's diffraction spikes live inside
  `lensdirt.frag.glsl`, not a separate billboard layer).
- **θ.13** — output dithering (Gaia Sky does not ship it).
- **SSR** — screen-space reflections, deferred.
- **Curvature / Reprojection / WarpingMesh / XBRZ** — dome/projection
  passes we do not port.

---

## Open visual tuning concerns (tracked separately)

- **Halo footprint size**: LightGlow default `textureScale × 1.6 =
0.65 NDC` matches Gaia exactly but is visually dramatic at
  solar-system zoom. If the user wants a subtler look, add a
  DisplayPanel "Star Halo Intensity" slider mapping to
  `effect.setTextureScale()` (not a drift — a user-facing knob). No
  planned work; tune on feedback.
- **Sun corona**: currently `ProceduralSun3D` sphere without
  post-process corona. Gaia Sky gets Sun corona from LensFlare (θ.4)
  - Bloom on HDR emissive. Will resolve when θ.4 ships.
- **`star-tex-03-*` asset parity**: our LightGlow sprite is a
  conservative pure-radial gaussian (equivalent to Gaia
  `textureIndex=4`). Gaia's default `textureIndexLens=3` has subtle
  cross spikes. Shipping the real asset is a one-line swap if
  licensing allows.
