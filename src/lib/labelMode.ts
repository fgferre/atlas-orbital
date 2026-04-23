/**
 * T4.5-β — body label rendering mode. Atlas has historically drawn
 * planet / moon / dwarf labels as HTML `<button>` overlays in
 * `PlanetOverlay.tsx` (a11y-native — real tab stops + visible text as
 * the accessible name for screen readers). Gaia renders the same
 * callouts as in-scene SDF text via `font.fragment.glsl` +
 * `LabelEntityRenderSystem.renderCelestial`. This mode lets users
 * flip between the two without dropping the a11y surface:
 *
 *  - `"html"` — HTML label text visible, `PlanetOverlay` owns both
 *     icons and labels. Default; keyboard + screen-reader friendly.
 *  - `"sdf"`  — `PlanetLabels3D` mounts drei `<Text>` (troika-
 *     three-text SDF) per visible body; HTML label text is hidden
 *     but icons + aria-labelled focus buttons stay as the a11y
 *     fallback (the 3D text itself is not focusable / screen-
 *     readable).
 *
 * The recommended default is `"html"` so a fresh boot keeps the a11y
 * guarantees the existing overlay provides; users who prefer the
 * Gaia-native look opt in via the Layers panel.
 *
 * Source citations (all under `/tmp/gaiasky/`):
 *  - `assets/shader/font.fragment.glsl:1-41` — MSDF font shader
 *    (math primitives pinned in `src/lib/msdfFontMath.ts` by T4.5-α).
 *  - `assets/shader/font.vertex.glsl:21-28` — per-body fade-in
 *    `v_opacity = clamp((pow(viewAngle, viewAnglePow) - thLabel) /
 *    thLabel, 0, 0.95) * componentAlpha` (not ported in β; atlas
 *    reuses `OverlayPositionTracker.showLabel` for visibility
 *    gating — documented divergence).
 *  - `core/src/gaiasky/scene/system/render/draw/text/
 *    LabelEntityRenderSystem.java:316-327 renderCelestial(...)` —
 *    the dispatch Gaia uses for body labels. Atlas's drei `<Text>`
 *    ports the output (SDF fragment via troika's default
 *    `fwidth()` smoothing — same decision as `GridAuLabels.tsx`
 *    shipped in T4.5-δ; Gaia's `1/(16 × u_scale)` override stays
 *    deferred behind T4.5-α's `MSDF_SMOOTHING_DIVISOR` constant
 *    for a later tightening onda).
 */

export type LabelMode = "html" | "sdf";

export const LABEL_MODES: readonly LabelMode[] = ["html", "sdf"] as const;

export const LABEL_MODE_LABELS: Record<LabelMode, string> = {
  html: "HTML 2D",
  sdf: "SDF 3D",
};

/**
 * Default mode on first boot. HTML stays the recommended baseline
 * because the HTML path is the only one that participates in the
 * browser's a11y tree (keyboard focus + screen reader announcements).
 * Surfacing the SDF option via LayersPanel lets users who want the
 * Gaia-faithful look opt in deliberately.
 */
export const DEFAULT_LABEL_MODE: LabelMode = "html";
