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
 *  - `assets/shader/font.fragment.glsl:1-41` — MSDF font shader.
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
 *    shipped in T4.5-δ, and settled rather than deferred; see
 *    `PlanetLabels3D.tsx` §Smoothing).
 */

export type LabelMode = "html" | "sdf";

export const LABEL_MODES: readonly LabelMode[] = ["html", "sdf"] as const;

export const LABEL_MODE_LABELS: Record<LabelMode, string> = {
  html: "HTML 2D",
  sdf: "SDF 3D",
};

/**
 * Default mode on first boot: `"sdf"`.
 *
 * The reason is depth, not looks — at 1440p the two renderers are nearly
 * indistinguishable. HTML labels are a flat DOM layer painted over the
 * canvas, so they carry no depth information whatsoever: with Mars focused,
 * Pluto's label rendered inside the Mars system next to Phobos and Deimos,
 * because screen-space proximity is all the overlay knows. A label that
 * lives in the scene can be occluded, depth-sorted and distance-faded. SDF
 * is the prerequisite for that class of fix.
 *
 * **A11y is unchanged by the flip.** The accessible surface for a body is
 * the icon `<button>` in `PlanetOverlay.tsx:31-47`, whose
 * `aria-label={`Focus ${item.name}`}` renders on `showIcons` alone and does
 * not consult `labelMode`. Keyboard tab stops and screen-reader
 * announcements are identical in both modes.
 *
 * Known edge, pre-existing and unchanged in kind: with icons toggled OFF
 * *and* SDF active, no focusable element remains per body (in HTML mode the
 * label button takes `tabIndex={0}` in that case). Bodies stay fully
 * keyboard-reachable through the Search panel; only the tab-through-visible-
 * bodies path is lost, and only for a user who deliberately hid the icons.
 */
export const DEFAULT_LABEL_MODE: LabelMode = "sdf";
