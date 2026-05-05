# T6 visual delivery failure — postmortem (2026-05-04)

**Source for**: `tasks/lessons.md` L37 (rendering claims need
runtime smoke) + L38 (cross-doc consistency).
**Active recovery**: `tasks/waves/T6.4-visual-recovery.md`.

---

## What happened

T6 wave (T6.0 → T6.3-ε, 17 commits over ~4 days) shipped the
full HYG focus pipeline:

- T6.0 (`e52561f`): HYG focus extension + Starfield skipMask infra
- T6.1 (`003002c`): externalized StellarVisualProfile + 3 new
  ProceduralSun3D props (`position`, `visualProfile`, `renderRange`)
- T6.2-α (`b1f7dc1`): stellarPhysics.ts (Ballesteros + MK lookup +
  visualProfile aggregator)
- T6.2-β-α (`8c1f37d`): HYG binary v2 format (parser + encoder)
- T6.2-β-β (`2bfb970`): build script + canonicalizer + cap +
  4 tier .bin files re-baked
- T6.3-α (`9be5bfe`): solid-angle hysteresis gate (dormant)
- T6.3-β (`f16ca78`): HygStellarMesh integration component
- T6.3-γ (`f02aec8`): CameraController HYG fly-to wire
- T6.3-δ (`4d38251`): Codex round-1 audit closure (3 fixes)
- T6.3-ε (`00e9a5a`): Codex round-2 audit closure (4 fixes)

Each commit passed: 1427/1427 vitest tests, lint clean, build
clean. Each got a SUBAGENT VERIFY pass (cold-read fresh Explore,
no parent context) — 8 total. Two rounds of external Codex
`gpt-5.2` audit caught 7 verified surface bugs across δ + ε.

**Two commits explicitly declared "T6 MVP CLOSED"** (T6.3-β
`f16ca78` and T6.3-γ `f02aec8`) — twice, the same wave shipped
"closed" without a single user-driven interactive smoke.

---

## What user found on first manual smoke (2026-05-04)

User ran `npm run dev`, opened the app, clicked a HYG named
star (Sirius). Observed:

- Camera flew toward the star (fly-to fired ✓)
- Hovered tooltip appeared on hover (~200ms sustain ✓)
- Click registered, focusId updated (✓)
- **Procedural mesh never appeared visually**
- Only the small sprite cross-spike remained at all distances
- No console errors, no lint warnings, no test failures

Claude's previous claims that "the full HYG zoom path is live"
and "T6 MVP genuinely closed" were technically accurate at the
infrastructure level but **completely wrong at the visual delivery
level**. The user's expectation — adapt the Sun's procedural
shader with parameters varying per star, plus a smooth transition
between sprite and mesh — was not honored.

---

## Root causes (4 silent failure modes)

### #1 — Float32 precision collapse at parsec scale

The 4 ProceduralSun3D shaders (sphere, glow, rays, flares)
compute geometry in WORLD SPACE:

```glsl
vec4 world = modelMatrix * vec4(position, 1.0);  // world ≈ starWorld
gl_Position = projectionMatrix * viewMatrix * world;
```

This works for the Sun because Sun is at world origin (0,0,0),
where fp32 has full precision (LSB ≈ machine epsilon × 1).

For HYG stars at parsec scale (5×10⁸ wu Sirius, 3×10¹⁰ wu
Betelgeuse), fp32 GPU LSB jumps to 64-4096 wu — far above star
radii (~7-4000 wu). All 64×64 sphere geometry vertices round to
the same fp32 grid bucket → **mesh degenerates → invisible**.

Numerical confirmation (decoded from HYG v2 binary):

| Star               | World dist (wu) | fp32 LSB (wu) |      Radius (wu) | Renderable?     |
| ------------------ | --------------: | ------------: | ---------------: | --------------- |
| Sirius (A0V)       |        5.44×10⁸ |            64 |              7.7 | ❌ radius < LSB |
| Vega (A0V)         |        1.58×10⁹ |           128 |              9.4 | ❌              |
| Proxima (M5.5V)    |        2.67×10⁸ |            16 |  4.66 (fallback) | ❌              |
| Betelgeuse (M2Ia)  |       3.15×10¹⁰ |          2048 | ~4128 (IF spect) | ⚠️ marginal     |
| Antares (M1Iab-Ib) |       3.50×10¹⁰ |          4096 | ~3164 (IF spect) | ❌              |
| Rigel (B8Ia)       |       5.46×10¹⁰ |          4096 |  ~363 (IF spect) | ❌ way < LSB    |

**Fix path**: Three.js's `modelViewMatrix` (computed CPU-side
in float64 via `Matrix4.multiplyMatrices`) already has the
camera-relative subtraction precise — just needs the shader to
USE it: `gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0)`.
This is the same pattern Gaia uses (`ParticleSet.fetchPosition:1112-1114`
quad-precision sub before float cast), implemented natively by
Three.js. Atlas already shipped Vector3Q (T4.1-α) months ago but
never wired it because the modelViewMatrix path is simpler.

### #2 — Hard sprite ↔ mesh transition with mis-coordinated thresholds

`a_skipMask` was a Float32 0/1 binary tied to the hysteresis flip
state. When `solidAngle > ENTER`, sprite hard-zeros + mesh
mounts in the same frame. No alpha cross-fade.

Plus **threshold mismatch**: the Starfield's `LEN0` sprite-fade
uniform hard-zeros sprites at `dist < LEN0 ≈ 134_000 wu`, while
the mesh `STELLAR_MESH_ENTER_RAD = 1e-3 rad` fires at much closer
distances (~7700 wu for Sirius). Camera approaching:

- dist > 134_000: sprite full visible, mesh inactive
- dist 7_700 → 134_000 (1:17 ratio): **sprite fading + mesh inactive = visual gap**
- dist < 7_700: mesh active (or would be, if root-cause-1 didn't
  kill it), sprite zeroed

User would see the sprite dim during fly-to before the mesh ever
appeared. Even if root-cause-1 were fixed, the visual would still
have a "flicker" or "void" mid-transition.

**Fix path**: focused-star-specific cross-fade ramp (Float32 0..1
continuous on `a_fadeAlpha[focusedK]`; mesh `uVisibility` synced).
Keep LEN0 + ENTER global constants (no perf regression risk).

### #3 — Partial class variation (3 of 28 fields)

`stellarVisualProfileFrom` aggregator was supposed to derive a
distinct visual profile per spectral class (color/size/brightness
varying). What actually shipped:

```ts
return {
  ...SUN_DEFAULT_VISUAL_PROFILE, // 25 fields stay solar
  surfaceBrightness: SUN.surfaceBrightness * brightnessScale,
  raysHue: SUN.raysHue + hueOffset,
  flaresHue: SUN.flaresHue + hueOffset,
};
```

Only 3 of 28 fields override. M-class red dwarf renders with
**Sun-yellow surface + red rays/flares** — visually incoherent.

**Fix path**: extend aggregator to vary granulation (5 fields),
surface (6 fields), glow (4 fields), rays (6 fields), flares (6
fields) by temperature + class. Acceptance is **PERCEPTUAL**
class distinction — not all 28 fields literally must vary; some
may stay solar if they don't contribute to perceived difference.

### #4 — Missing supergiant spect in v2 binary

T6.2-β-β re-bake's `capSpectByFrequency` keeps the top 254
canonical classes by frequency. Rare supergiant classes (M2Ia,
M1Iab-Ib, B8Ia, M5.5V) fell off the cap → routed to ""
sentinel → `radiusFromSpect("")` falls back to 1.0 R_sol.

Verified empty `spect` for: Betelgeuse (idx 9), Antares (idx 16),
Rigel (idx 6), Proxima (idx 105913). All would render Sun-sized
even after root-cause-1 fix.

**Fix path**: allowlist named-star canonical classes in
`build-hyg-binary.js` capSpectByFrequency + re-bake, OR runtime
absmag+B-V → R_sun fallback in `radiusFromSpect`. Recommended:
both paths combined for defense in depth.

---

## Why every gate passed

| Gate                              | What it tests       | Why it missed                 |
| --------------------------------- | ------------------- | ----------------------------- |
| Unit tests (1427/1427)            | TypeScript logic    | Don't render GPU output       |
| Lint                              | Syntax style        | Doesn't run code              |
| Build                             | Compile + bundle    | Doesn't run shaders           |
| SUBAGENT VERIFY (Sonnet, 8×)      | Cold-read TS code   | Reads source, doesn't run app |
| Codex `gpt-5.2` round 1 (3 P1/P2) | Cold-read TS+shader | Reads source, doesn't run app |
| Codex `gpt-5.2` round 2 (4 P2/P3) | Cold-read TS+shader | Reads source, doesn't run app |

**The class of bug that ALL of these miss**: anything where the
failure mode is GPU-side at runtime under specific scale
conditions. Float32 precision collapse at parsec doesn't show
up in any of the gates above. Hard transitions between sprite
and mesh look fine in code review. Class-distinction shortfall
is a perceptual call that requires running the app + comparing
multiple stars side-by-side.

---

## Why "deferred to user" was the wrong escape hatch

Multiple ship messages cited the pattern: "preview-MCP couldn't
exercise R3F-store synthetic-focus dispatch / pointer-lock /
manual zoom — interactive verification deferred to user." This
showed up in T4.2-β-handler-Silver, T6.3-β, T6.3-γ.

The pattern shifted validation from "the only path that catches
this class of bug" to "optional homework the user might never
do." Two commits shipped declaring T6 MVP closed without the
user ever once running the app. The user did the interactive
smoke 4 commits later than they should have, and found the
fundamental issue immediately.

**Better protocol** (codified as L37): if preview-MCP can't drive
the trigger directly, expose dev diagnostics on `window` for that
session, drive programmatically, then **remove the diagnostics
before commit** (M7-style cleanup). The temporary `window.__atlasStore`

- `window.__atlasCamera` + `window.__atlasScene` exposed during
  2026-05-04 debugging was exactly this pattern — and it surfaced
  the root cause within 30 minutes. The pattern works; what was
  missing was the discipline to apply it as the FINAL gate before
  declaring shipped.

---

## Why Codex caught surface bugs but not visual

Codex round 1 + round 2 caught 7 verified bugs across T6.3-δ +
T6.3-ε:

- P1 frame-loop early-return (HYG focus path)
- P2 small-star clamp pushing white dwarfs below mesh threshold
- P2 skipMask deps missing catalog (tier-flip un-suppress)
- P2 quality strand (out-of-range starIndex)
- P3 click bypasses selectedId
- P3 projection lines stale on HYG focus
- P3 spect coverage doc claim wrong (96.59% vs claimed 99.22%)

All 7 are TypeScript-side or doc-side bugs. Codex doesn't run
the app either. Its blindspots align with the implementer's
untested-runtime gaps.

This is consistent with the broader pattern: cold-read audits
materially expand the bug-catch surface for the parts they
read, but they have the same blind spot as any reviewer who
doesn't drive the actual user path.

---

## Recovery plan

`tasks/waves/T6.4-visual-recovery.md` (PRIORITY 0) — M1-M7
milestones with Codex audit per milestone before commit. M1
(sphere shader → modelViewMatrix) is the smallest possible
validation of the precision hypothesis.

---

## Distilled rules → lessons.md

### L37 — Rendering claims need runtime smoke

**Trigger**: shader / material / canvas / scene-tree / rendering
behavior changes; any wave touching non-origin world positions.

**Rule**: do not declare shipped until real browser visual smoke
exercises the user path.

**Action**: drive via Preview MCP (or equivalent) with browser
console + WebGL context check + visual screenshot of the user
path. If preview can't drive the trigger directly, expose temp
diagnostics on `window`, drive programmatically, REMOVE before
commit. No "deferred to user" for visual rendering claims.

**Source**: `tasks/archive/postmortems/T6-visual-failure.md`.

### L38 — Cross-document consistency is a separate verification step

**Trigger**: applying audit corrections (Codex/SUBAGENT/etc.)
across multiple docs.

**Rule**: same fact lives in one canonical place; other docs
link. After editing a wave-file detail block, grep cross-doc for
references that summarize/quote/depend-on it. Run
`npm run docs:check` before declaring "ready for fresh /loop."

**Action**: per L38 restructure, STATUS = hot path, ROADMAP =
strategic index, lessons.md = compact rules, archive = history,
waves/ = active wave plans. Edits to wave detail don't ripple
to STATUS unless Active wave changes. Run docs:check as final
gate.

**Source**: `tasks/archive/postmortems/T6-visual-failure.md`
(this file) — the 4-commit doc-correction cycle (`68b1d9f` →
`1f20e36` → `0b4c648` → `3b011d5`) that this rule prevents.

### Adjacent — Adapt Gaia's solved patterns; don't reinvent

**Trigger**: atlas hits a precision/scale problem at a layer
where Gaia already has a working strategy.

**Rule**: read Gaia's source first; map atlas's problem to
Gaia's pattern; use atlas's existing helpers (Vector3Q from
T4.1-α, bridge from T4.1-β-bridge) OR Three.js's built-in
equivalents (modelViewMatrix camera-relative subtract is
free in shader); only invent new infrastructure if neither
fits.

**Source**: `tasks/archive/postmortems/T6-visual-failure.md`.
Gaia's `ParticleSet.fetchPosition:1112-1114` does the
camera-relative subtract in CPU quad-precision before float
cast; Three.js's `Matrix4.multiplyMatrices` does the same in
float64 CPU-side. Atlas shipped both T4.1-α and T4.1-β-bridge
months before T6 needed precision tools; both sat dormant
because nobody mapped T6's problem to the existing toolkit.
