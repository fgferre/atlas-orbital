# Wave α polish — VisualPresets AgX recalibration

Copy everything between the markers into a fresh Claude Code session.

```text
===COMEÇA===

Atlas Orbital — Wave α polish: VisualPresets.ts recalibration for AgX

Role:
You are closing one specific debt from Wave α. The HDR pipeline + graphics
panel shipped across 12 commits (`8969cf7..0ef3054`). The visual feel
still isn't where the user wants it — grading values in
`src/config/visualPresets.ts` were tuned pre-Wave-α when Reinhard tone
mapping ran at the renderer level and consumed everything > 1.0. Post
Wave α the composer runs AgX and grading sits AFTER tone mapping on
the LDR buffer. Same knob values, different curve behind them,
different result on screen.

Mission:
Iterate visually on the VISUAL_PRESETS values until the app "feels
right" under AgX. Ship one commit. Artisan work — not gate-driven.

### What Wave α changed that matters here

1. Renderer: `NoToneMapping` (was Reinhard). Composer owns tone mapping.
2. Composer chain: `Bloom → ToneMapping(AGX) → HueSaturation →
   BrightnessContrast`. Grading runs on LDR post-AgX.
3. Selective bloom: `luminanceThreshold=1.0`, `vfxHdrGain` lifts
   bright-star fragments above 1.0 per tier (ultra 4.0 / high 3.0 /
   balanced 2.5 / constrained 1.0).
4. Env-map IBL sun mesh dropped from color[10,10,10] → [2,2,2].

### Current values in src/config/visualPresets.ts

Every preset (DEEP_SPACE / PLANET_ORBIT / CLOSE_FLYBY / INNER_SYSTEM /
OUTER_SYSTEM) currently carries IDENTICAL values:

    bloomIntensity:     1.0
    bloomThreshold:     1.0
    bloomRadius:        0.3
    saturation:         0.29    ← suspect, tuned for Reinhard
    contrast:           0.42    ← suspect, tuned for Reinhard
    brightness:         0.0
    ambientIntensity:   0.035
    sunIntensity:       0.4
    shadowIntensity:    1.5
    envMapIntensity:    1.9
    guideIntensity:     varies by preset (0.7–1.0; this one IS
                        intentionally differentiated — don't touch
                        without reason)
    vectorIntensity:    1.0

The three most-suspect-under-AgX knobs are saturation, contrast,
brightness. AgX preserves highlight color better than Reinhard, so a
saturation boost tuned for Reinhard's more-desaturated output now
over-saturates. AgX also has a softer contrast response, so the 0.42
contrast boost may crush shadows harder than before.

Plausible starting targets to try:
    saturation:   0.15 – 0.20   (was 0.29)
    contrast:     0.25 – 0.35   (was 0.42)
    brightness:   0.0 – +0.05   (if overall feel is dimmer)

Secondary knobs that may need small adjustment:
    ambientIntensity  (planet dark side readability)
    envMapIntensity   (IBL sun mesh is 5× dimmer than before —
                       may need a compensating bump here)

### Approach

This is artisan visual iteration, not a math problem. Expect 3–5 tuning
rounds, each ~5 minutes.

1. Start a local preview (`npm run dev`) OR use the Claude Preview MCP
   (allowed per the AGENTS.md "Browser automation" section). MCP is
   faster for back-to-back screenshots. Mind L11 in tasks/lessons.md:
   if HMR stalls after several edits, `preview_stop` + `preview_start`
   to reset.
2. On **Ultra tier** (open Display panel, Auto off, Ultra), visit a
   few representative views:
     - Default camera on boot (wide outer solar system)
     - Focus Earth (planet with atmosphere + terminator + clouds)
     - Focus Sun (bright emissive + corona)
     - Focus Saturn (rings, high HDR contrast between disk + rings)
     - Starfield alone (camera pulled back, planets small) —
       bloom on bright stars should be visible without flooding
       the sky
3. Adjust saturation / contrast / brightness incrementally. Commit
   one number at a time mentally; don't change three at once. Take
   a screenshot after each adjustment and compare to the prior.
4. If overall look is dim: small ambientIntensity bump OR
   envMapIntensity bump. Prefer envMapIntensity — ambient affects
   shadow-side readability; envMap affects planet reflective lit
   side differently.
5. Stop when it feels "right" to you. There is no numeric target.

### Optional stretch

`visualPresets.ts` carries 5 presets with identical core values;
the file header comment documents intended per-context differentiation
(DEEP_SPACE gets higher bloom, CLOSE_FLYBY gets less bloom + more
detail, INNER_SYSTEM gets warmer saturation, etc.). If time remains
after the base pass, differentiate the 5 presets along those lines.
Not required — the auto-preset lerp makes this invisible to users who
don't focus-zoom.

### Scope

In scope:
  - src/config/visualPresets.ts — the ONLY file you should need
    to edit.
  - Optional: the visualPreset auto-selection thresholds in the same
    file (`getPresetForContext`) if the transitions feel wrong.

Out of scope:
  - Anything in src/components/canvas/scene/ (the hook math is
    correct — this is a value-tuning pass, not a pipeline change).
  - qualityProfile.ts (vfxHdrGain is owned there; leave alone).
  - The composer order in PostProcessingPipeline.tsx (locked post
    wave-alpha-polish).
  - Any new dep, any new file.

### Gates

  npm run lint
  npm run test:run — `visualPresetOverrides.test.ts` uses
    BASE_PRESET imported from visualPresets, so value changes
    propagate automatically (no test edits expected). If a test
    fails because it references a specific preset numeric, that
    means it was wrong to pin that number — update the test to
    stay relative (preset base × multiplier) rather than absolute.
  npm run build
  npx playwright test --workers=1 — `--update-snapshots` if the
    boot-frozen baseline visibly shifts (it probably won't because
    headless Chromium auto-resolves to constrained tier on the
    default profile, and constrained disables postprocessing).

### Commit format

One commit, `style(visuals): recalibrate visualPresets for AgX
pipeline`. Body should carry:
  - Before-after numbers for each changed field
  - One-sentence rationale per change
  - Acknowledgement that this is visual iteration, not math-gated

If preset differentiation ships (stretch), separate commit after
the base tuning commit.

### Reference reads before editing

  - tasks/todo.md — current Active block (Route A polish items)
  - tasks/lessons.md L13–L17 — prior calibration patterns + tooling
    notes (especially L16 on Fechner log-compression + L17 on porting
    numbers vs formulas)
  - src/components/canvas/scene/PostProcessingPipeline.tsx — the
    effect chain comment block explains the contract the grading
    has to work within
  - src/config/visualPresets.ts — the file itself, plus the TODO
    header comment listing per-context differentiation ideas

===TERMINA===
```

## Usage

1. Fresh Claude Code window in the atlas-orbital repo.
2. Paste everything between `===COMEÇA===` and `===TERMINA===`.
3. Session iterates visually until the feel matches what you want;
   commits once.
4. If per-preset differentiation ships, expect a second commit.

## After this lands

Route A item 4 (menu structure consolidation) is the last polish item.
That one is a UX design pass — needs wireframe and user conversation
before coding, so it doesn't get a self-contained prompt here.

After item 4 or in parallel with it, Wave β (per-body atmosphere) is
the next real feature wave — prompt derives from
`tasks/implementation-roadmap.md` Wave β card + `tasks/lighting-backlog.md`
R1 #3.
