# Graphics Settings — AAA Benchmark

Research session: 2026-04-18. Part of the R2 Graphics Settings initiative. See
`tasks/graphics-settings-design.md` for the executable spec derived from this
benchmark.

## Scope & method

Seven AAA titles surveyed, grouped into two buckets:

- **Bucket A — AAA open-world / shooter polish:** Cyberpunk 2077, Red Dead
  Redemption 2, Starfield, Death Stranding (Director's Cut), Horizon Forbidden
  West (PC).
- **Bucket B — Space & flight-sim specialists:** Star Citizen, Microsoft Flight
  Simulator 2024.

Elite Dangerous and Kerbal Space Program 2 were dropped — their settings
menus are thin and reinforce no pattern the other seven don't already cover.

Sources: PCGamingWiki settings sections, cross-checked against Digital
Foundry PC tech reviews where a DF article exists. When PCGW normalization
and DF/UI screenshots disagreed on exact label wording, DF was preferred
(verbatim in-game labels beat wiki-normalized labels).

## Per-game breakdown

### Cyberpunk 2077 (CDPR, REDengine 4)

- **Top-level tabs.** Video | Graphics | Audio | Controls | Gameplay |
  Interface | **Accessibility**. _Video_ and _Graphics_ are split — Video
  holds resolution/window mode/HDR/FOV/motion blur strength; Graphics holds
  the quality sliders.
- **Preset → granular.** Quick Preset dropdown (Low / Medium / High / Ultra /
  Ray Tracing Low-Medium-Ultra-Overdrive / Custom). Changing any child
  control auto-flips the preset to "Custom"; no modal confirm.
- **Groupings inside Graphics:** Basic | Advanced | Ray Tracing | DLSS/FSR/XeSS
  (upscaler section added in patch 2.0).
- **Control types.** Dropdowns for quality tiers (Texture Quality, Shadow
  Quality, etc.), toggles for binary effects, numeric sliders for FOV and
  Motion Blur Strength, percentage slider for DLSS/FSR resolution scale.
- **Camera effects placement.** Film Grain, Chromatic Aberration, Depth of
  Field, Lens Flare, Motion Blur live in the **Video** tab as individual
  toggles — deliberately separated from Graphics.
- **Persistence.** Changes apply on an "Apply" button at tab bottom;
  resolution change triggers a 15-second revert-countdown modal.
- **Accessibility.** Separate top-level tab — Large Font, Subtitles,
  Colorblind Mode (Deuteranopia/Protanopia/Tritanopia), Text Background
  Opacity.
- Sources: PCGamingWiki "Cyberpunk 2077" settings section; Digital Foundry
  "Cyberpunk 2077 PC — The Digital Foundry Tech Review" (Dec 2020);
  DF "Phantom Liberty / Patch 2.0 PC analysis" (Sept 2023).

### Red Dead Redemption 2 (Rockstar, RAGE)

- **Top-level tabs.** Graphics | **Advanced Graphics** (two sibling tabs, not
  nested).
- **Preset.** "Quality Preset Level" single master slider with 7 notches
  (Favour Performance → Favour Quality, plus Custom). The preset is a
  _slider_, not a dropdown — unique in the cohort.
- **Groupings (Graphics tab, in order):** Texture Quality, Anisotropic
  Filtering, Lighting Quality, Global Illumination, Shadow Quality, Far
  Shadow Quality, Screen Space Ambient Occlusion, Reflection Quality,
  Mirror Quality, Water Quality, Volumetrics Quality, Particle Quality,
  Tessellation Quality.
- **Advanced Graphics tab.** Uncapped / VRAM-dangerous toggles with **live
  VRAM cost readouts per option** (e.g. "Near Volumetric Resolution: High —
  +450 MB VRAM"). A live VRAM budget meter at the top of the Advanced panel
  is the strongest UX pattern in the genre.
- **Control types.** Per-setting sliders with named notches
  (Low/Medium/High/Ultra) — no dropdowns.
- **Camera effects.** Motion Blur and Depth of Field are plain toggles in
  the Graphics tab alongside quality items — not separated.
- **Persistence.** "Apply" at bottom, revert-countdown modal on
  resolution/windowing changes.
- Sources: PCGamingWiki "Red Dead Redemption 2" settings section; DF
  "RDR2 PC — tech review" (Nov 2019).

### Starfield (Bethesda, Creation Engine 2)

- **Top-level tabs.** Display | Graphics | Gameplay | Controls |
  Accessibility.
- **Preset.** Graphics Preset dropdown (Low / Medium / High / Ultra /
  Custom). Silent flip to Custom on child change.
- **Groupings (Graphics tab, flat list, no sub-headers):** Dynamic
  Resolution, Render Resolution Scale, Upscaling (FSR/DLSS post-patch),
  Graphics Preset, Shadow Quality, Indirect Lighting, Reflections, Particle
  Quality, Volumetric Lighting, Crowd Density, Motion Blur, GTAO Quality,
  Grass Quality, Contact Shadows, VSync. Notably shallow — Bethesda ships no
  Basic/Advanced split.
- **Control types.** Dropdowns (Low/Med/High/Ultra) dominate + toggles
  (Dynamic Resolution, Motion Blur, VSync) + one slider (Render Resolution
  Scale %).
- **Camera effects.** Motion Blur is a standalone toggle inside Graphics;
  Film Grain / DoF are not user-exposed.
- **Accessibility.** Dedicated tab — Subtitles, Dialogue Subtitles, Dialogue
  Camera, HUD Opacity, Aim Assist.
- Sources: PCGamingWiki "Starfield" settings section; DF "Starfield PC —
  performance analysis" (Sept 2023).

### Death Stranding / Director's Cut (Kojima, Decima)

- **Top-level tabs.** Display | Graphics | Controls | Audio | Language.
- **Preset.** "Graphics Preset" dropdown (Very Low / Low / Medium / High /
  Very High / Custom).
- **Groupings (Graphics tab, flat):** Model Detail, Texture Filtering,
  Screen Space Reflections, Memory (separate — warns on VRAM overrun), Depth
  of Field, Motion Blur, Vignette, Lens Flare, Ambient Occlusion, Shadow,
  Anisotropic Filter, Variable Rate Shading, DLSS/FSR. Decima's camera
  effects (DoF, Motion Blur, Vignette, Lens Flare) appear as individual
  toggles interleaved with quality dropdowns — no visual grouping.
- **Control types.** Dropdowns + toggles; no freeform sliders except
  DLSS/FSR quality mode.
- **Persistence.** Immediate apply for most items (no Apply button),
  countdown modal only on resolution.
- Sources: PCGamingWiki "Death Stranding" / "Death Stranding Director's Cut"
  settings sections; DF "Death Stranding PC — tech review" (Jul 2020).

### Horizon Forbidden West (Guerrilla, Decima — newer build)

- **Top-level tabs.** Display | Graphics | **Camera** | Audio | Controls |
  Accessibility | HUD.
- **Preset.** "Preset" dropdown (Low / Medium / High / Very High / Ultra /
  Custom).
- **Groupings (Graphics tab, with section headers):** Upscaling and
  Sharpening | Textures and Models | Shadows | Reflections | Lighting and
  Ambient Occlusion | Terrain and Foliage | Effects | Anti-Aliasing.
  Rendered as actual section headers — the cleanest category hierarchy of
  the seven.
- **Camera tab.** Dedicated top-level tab (Field of View, Motion Blur
  Strength, Depth of Field, Chromatic Aberration, Lens Flare, Lens
  Distortion, Vignette, Film Grain) — the strongest "camera effects as
  their own thing" pattern in the cohort.
- **Control types.** Dropdowns for quality, intensity sliders (0–10) for
  camera effects, toggles for on/off.
- **Accessibility.** Separate tab (Colorblind, Subtitles, HUD Scale, Aim
  Assist).
- Sources: PCGamingWiki "Horizon Forbidden West" settings section; DF
  "Horizon Forbidden West Complete Edition PC — tech review" (Mar 2024).

### Star Citizen (CIG, Star Engine)

- **Top-level tabs.** Graphics | Video | Audio | Keybindings | Comms | Game
  Settings.
- **Preset.** "Overall Quality" dropdown (Low / Medium / High / Very High /
  Custom). Unusually, custom sub-settings are hidden by default — an
  "Advanced" expander toggle reveals them.
- **Groupings (under Advanced).** Objects, Particles, Post Processing,
  Shading, Shadows, Terrain, Textures, Volumetric Fog, Volumetric Clouds,
  Water, Physics Quality. Each accepts a Low/Med/High/VeryHigh dropdown.
- **Camera effects.** Motion Blur and Chromatic Aberration are individual
  toggles under "Post Processing"; Film Grain is not exposed.
- **Persistence.** Apply button; no revert countdown (CIG trusts user
  judgment).
- Source: PCGamingWiki "Star Citizen" settings section; Roberts Space
  Industries in-game reference (no DF article exists for SC).

### Microsoft Flight Simulator 2024 (Asobo)

- **Top-level tabs.** General Options → sub-tabs: Graphics | Display |
  Traffic | Data | Online | Accessibility | **Camera** | Misc. Graphics
  itself splits into **Global Rendering Quality** (master preset) and
  per-setting granular overrides.
- **Preset.** "Global Rendering Quality" dropdown (Low / Medium / High /
  Ultra / Custom). Each child setting shows the preset-derived value and a
  per-row override.
- **Groupings (Graphics, with headers):** Anti-Aliasing | Render Scaling |
  Upscaling (DLSS/FSR/TAA/DLAA) | Terrain Level of Detail | Objects Level of
  Detail | Water Waves | Shadow Maps | Terrain Shadows | Contact Shadows |
  Windshield Effects | Ambient Occlusion | Cubemap Reflections | Raymarched
  Reflections | Texture Resolution | Anisotropic Filtering | Texture
  Supersampling | Texture Synthesis | Clouds Quality | Volumetric Clouds
  Quality | Glass Cockpit Refresh Rate.
- **LoD sliders.** Terrain LoD and Objects LoD are numeric sliders
  (10–400), not quality tiers — rare in the cohort, and directly relevant to
  a solar-system visualizer (streaming budgets).
- **Camera tab.** Camera Shake, Cockpit Camera settings (sensitivity, lean,
  zoom).
- **Persistence.** Apply & Save at bottom; granular VRAM/streaming hint per
  setting on hover.
- **Accessibility.** Dedicated tab — Text to Speech, Captions, Colorblind
  Filter, Menu Narration.
- Sources: PCGamingWiki "Microsoft Flight Simulator 2024" settings section;
  DF "MSFS 2024 PC — tech review" (Nov 2024).

## Consolidated findings

| Pattern                    | Dominant convention                                                                          | Dissenters                                |
| -------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Preset control             | Dropdown with explicit "Custom" terminal value                                               | RDR2 (slider preset), SC (expander-gated) |
| Preset → custom transition | Silent auto-flip to "Custom" on any child change                                             | None                                      |
| Advanced/Basic split       | Present as second tab (RDR2) or expander (SC, MSFS hints)                                    | Starfield, Death Stranding flat           |
| Camera-effects grouping    | Separate top-level tab (HFW, MSFS) OR separate "Video" vs "Graphics" tab (CP2077)            | DS / Starfield interleave                 |
| Control type               | Dropdown dominates for quality tiers; slider for scalars (resolution %, FOV, LoD, intensity) | RDR2 notched slider for everything        |
| Apply semantics            | "Apply" button at tab bottom + revert-countdown modal on resolution/windowing                | DS applies immediately                    |
| VRAM feedback              | RDR2 per-row VRAM delta (gold standard); MSFS hover hints                                    | Others silent                             |
| Accessibility              | **Always a separate top-level tab, never nested under Graphics**                             | Universal                                 |

**Bucket B (space/flight sims — SC, MSFS) emphasizes:** LoD as numeric
slider (streaming budget legibility), volumetric clouds/fog as first-class
categories, and shallow preset-to-granular paths (users expect to tune).

**Bucket A (CP2077, RDR2, HFW) contributes:** cleaner section headers
inside Graphics, camera-effects tab separation, revert-countdown safety
net, VRAM budget visibility.

## Five recommendations for Atlas Orbital (a web-based solar-system visualizer)

1. **Three top-level surfaces:** _Display_ (canvas size, pixel ratio, HDR if
   WebGPU), _Graphics_ (quality), and a separate _Camera_ surface (FOV,
   motion blur strength, DoF, lens flare, chromatic aberration, film grain,
   vignette). HFW's separation is the strongest pattern; camera effects are
   aesthetic, not performance, and should never be nested under Rendering
   quality.
2. **Preset dropdown + silent Custom flip**, CP2077/Starfield style. Offer
   _Low / Medium / High / Ultra / Custom_. Inside Graphics, use HFW-style
   section headers (Rendering, Textures, Shadows, Atmosphere/Volumetrics,
   Post-Processing).
3. **Expose LoD as numeric sliders, not quality tiers** (MSFS pattern):
   "Body Mesh LoD 10–400", "Orbit Line Density 10–400". A solar-system
   viewer's streaming budget is its dominant perf knob — don't bucket it
   into Low/Med/High.
4. **RDR2-style budget meter** at the top of Graphics: best-effort memory
   indicator plus per-row deltas on hover. For a web runtime use
   `performance.memory` with a clear "best-effort heap indicator" label —
   never claim VRAM precision.
5. **Accessibility as a top-level sibling**, not nested under Graphics —
   every AAA title in the cohort does this. Atlas Orbital should match.
   Plus a revert-countdown (10 s auto-revert) for any setting that can
   break the canvas (resolution scale, WebGPU toggle, upscaler change).
