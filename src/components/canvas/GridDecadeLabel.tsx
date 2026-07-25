import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

import { useStore } from "../../store";
import { GRID_RECURSIVE_CONFIG } from "./gridRecursiveConfig";
import {
  computeViewExtentWorld,
  formatDecadeScaleLabel,
  resolveGridRingSet,
} from "./shaders/gridRecScaling";
import { createGridFadeState, stepGridFade } from "./gridFade";
import { beginLabelReservations, reserveLabelBox } from "./labelReservations";

/**
 * The flat-on-plane teal AU DISTANCE LABELS for the concentric ring grid
 * (redesign 2026-06-18). The grid IS the distance indicator; these labels
 * name each MAJOR ring with its AU value ("1 AU", "2 AU", "5 AU", "10 AU",
 * …) auto-switching to light-years ONLY at realistic stellar scale. One of
 * them — the dominant visible ring — is shown PROMINENT (brighter, larger)
 * as the SSS-style "current scale" label.
 *
 * **Labels sit ON the rings they name, and TRACK them across zoom.** Both
 * the label values and their placement derive from the SAME
 * `resolveGridRingSet(...)` the ring mesh uses, fed the IDENTICAL view
 * extent — so the two share one memoised computation per frame and never
 * disagree. Each label is placed at world radius `ring.radius` (=
 * `auToWorld(ring.au, scaleMode)`) along the camera's ground-projected
 * view heading, Sun-centered — so "5 AU" sits exactly on the 5-AU ring.
 * As the LOD adds/removes major rings on zoom, labels appear/disappear
 * with them (a fixed pool of `<Text>` slots assigned per frame; surplus
 * slots are hidden — no stale/orphaned labels).
 *
 * **Screen-stable size (never balloons).** Each glyph's world size scales
 * with camera distance so its on-screen pixel height stays ~constant — the
 * same screen-stable trick as `PlanetLabels3D` (`group.scale` on a
 * `fontSize = 1` base, capped at the top end to avoid GPU rasterization
 * stalls at intro-camera distances). It does NOT grow when the camera is
 * close (the owner's original ballooning complaint).
 *
 * **Decluttered.** Labels are placed along ONE ground-forward ray, so on
 * screen they stack radially. We drop any label whose screen-projected
 * position is closer than a minimum pixel gap to an already-kept label,
 * keeping higher-priority ones first (the dominant scale label, then
 * nearer major rings). Never lets two labels overlap.
 *
 * **Flat, legible at grazing angles.** `rotation.x = -π/2` lays the text
 * in the ecliptic plane; the in-plane spin follows the camera heading so
 * the baseline runs across the view. All labels fade out together below a
 * minimum camera elevation (near edge-on flat glyphs collapse to a line).
 *
 * **Honesty (AGENTS.md pillar 18).** Didactic mode suppresses the AU→LY
 * switch (`allowLY = false`) — the compression saturates at ≈323 AU and
 * can never reach light-years. The "not to scale" framing still governs.
 *
 * **Toggle.** Rides the master Grid toggle (`showEclipticGrid`), decoupled
 * from `showLabels` (the body-name flag).
 */

/** Cyan/teal measurement accent — the grid's single accent hue. */
const ACCENT_TEAL = GRID_RECURSIVE_CONFIG.ringColor;

/**
 * Halo behind the glyphs. Near-black navy rather than pure black so it
 * reads as depth against the space background instead of a punched hole.
 */
const LABEL_HALO = "#00060f";

/**
 * Screen-stable font size: base world-unit value × `distance / divisor`
 * so the on-screen pixel height stays ~constant. Mirrors `PlanetLabels3D`.
 * The dominant ("current scale") label uses the larger base.
 */
const FONT_WORLD_BASE = 16;
const FONT_WORLD_BASE_DOMINANT = 26;
const FONT_DISTANCE_DIVISOR = 1000;

/**
 * Upper cap on a label's world-space scale. Sized to keep genuine GALACTIC
 * framings screen-stable: at ~10^5 LY the labeled ring sits at ~10^13 world
 * units, so a constant-screen label there needs a world scale of
 * `distance/divisor × base` ≈ 10^11 — which must NOT be clamped, or far
 * labels would shrink to invisible. The cap therefore sits well above that
 * (10^12) so it only ever catches a runaway (NaN-adjacent / detached
 * camera) rather than legitimate deep-zoom sizes. Below the cap the size is
 * exactly proportional to distance (constant on-screen pixel height).
 */
const LABEL_SCALE_MAX_WORLD_UNITS = 1e12;

/**
 * Min-elevation fade. Below ~6° the flat glyphs collapse to a line and the
 * label is unreadable, so we ramp opacity 0→1 across [MIN, FULL].
 */
const ELEVATION_FADE_MIN_RAD = THREE.MathUtils.degToRad(6);
const ELEVATION_FADE_FULL_RAD = THREE.MathUtils.degToRad(18);

/**
 * Minimum on-screen gap (fraction of viewport height) between two kept
 * labels. Closer pairs declutter — the lower-priority one is dropped.
 */
const DECLUTTER_MIN_NDC_GAP = 0.06;

/**
 * Pool of label slots. The ring set emits at most ~12 rings, of which the
 * major subset is labelled; the pool is sized comfortably above that.
 */
const LABEL_POOL_SIZE = 12;

const noopRaycast: THREE.Object3D["raycast"] = () => null;

// Module-level scratch reused across frames (no per-frame allocation).
const TMP_GROUND_HEADING = new THREE.Vector3();
const TMP_WORLD = new THREE.Vector3();

interface LabelSlot {
  group: THREE.Group | null;
  text: THREE.Mesh | null;
  /** Last value committed to troika, to avoid redundant text re-layout. */
  lastText: string;
}

export const GridDecadeLabel = () => {
  const { camera } = useThree();
  const controls = useThree(
    (state) => state.controls
  ) as OrbitControlsImpl | null;
  const scaleMode = useStore((s) => s.scaleMode);

  // ── Unified grid fade (shared with GridRecursive) ──
  // Same pure target + lerp the rings run, so labels rise/fall in lockstep
  // with them. Multiplied INTO the existing elevation/declutter fades, not
  // replacing them. See gridFade.ts.
  const sceneReady = useStore((s) => s.isSceneReady);
  const introActive = useStore((s) => s.isIntroAnimating);
  const showGrid = useStore((s) => s.showEclipticGrid);
  const reducedMotion = useStore((s) => s.accessibility.reducedMotion);

  const slots = useRef<LabelSlot[]>(
    Array.from({ length: LABEL_POOL_SIZE }, () => ({
      group: null,
      text: null,
      lastText: "",
    }))
  );

  // Per-component fade state (mutated only inside useFrame).
  const fadeStateRef = useRef(createGridFadeState());

  const planeY = GRID_RECURSIVE_CONFIG.planeYOffset;

  useFrame((state, dt) => {
    const frame = state.gl.info.render.frame;
    const viewportWidth = state.size.width;
    const viewportHeight = state.size.height;
    // Pixels a one-world-unit object spans at one unit of depth. Combined
    // with the label's distance-proportional scale this yields the constant
    // on-screen height the labels are designed to hold.
    const pixelsPerWorldUnitAtUnitDepth =
      viewportHeight /
      (2 *
        Math.tan(
          (((camera as THREE.PerspectiveCamera).fov ?? 45) * Math.PI) / 360
        ));
    beginLabelReservations(frame);
    // Unified grid fade — identical step to GridRecursive, so labels and
    // rings rise/fall together. Combined (multiplied) with the per-label
    // elevation fade below.
    const gridFade = stepGridFade(
      fadeStateRef.current,
      { sceneReady, introActive, showGrid },
      scaleMode,
      dt,
      reducedMotion
    );

    // Ring set — fed the IDENTICAL view extent the ring mesh uses, so the
    // per-frame memo coalesces both callers into one selection.
    const viewExtentWorld = computeViewExtentWorld(
      camera,
      controls?.target ?? null
    );
    const { rings, labelAU } = resolveGridRingSet(viewExtentWorld, scaleMode);

    const allowLY = scaleMode === "realistic";

    // Ground-forward heading: the camera's ground-projected VIEW direction
    // (Sun → look-at target), so labels sit in front of where the learner
    // is looking. Rings are Sun-centered, so placing a label at radius
    // `ring.radius` along this ray from the ORIGIN lands it on the ring.
    const target = controls?.target ?? null;
    if (target) {
      TMP_GROUND_HEADING.set(target.x, 0, target.z);
    } else {
      TMP_GROUND_HEADING.set(0, 0, 0);
    }
    if (TMP_GROUND_HEADING.lengthSq() < 1e-6) {
      TMP_GROUND_HEADING.set(camera.position.x, 0, camera.position.z);
    }
    if (TMP_GROUND_HEADING.lengthSq() < 1e-6) {
      TMP_GROUND_HEADING.set(0, 0, 1);
    }
    TMP_GROUND_HEADING.normalize();

    const azimuth = Math.atan2(TMP_GROUND_HEADING.x, TMP_GROUND_HEADING.z);

    // Elevation fade (shared by all labels): the camera's angle above the
    // plane, measured at the look-at target. Near edge-on, fade out.
    const horizDistToTarget = target
      ? Math.hypot(camera.position.x - target.x, camera.position.z - target.z)
      : Math.hypot(camera.position.x, camera.position.z);
    const elevation = Math.atan2(
      Math.abs(camera.position.y - planeY),
      Math.max(horizDistToTarget, 1e-6)
    );
    const elevationFade = THREE.MathUtils.clamp(
      (elevation - ELEVATION_FADE_MIN_RAD) /
        (ELEVATION_FADE_FULL_RAD - ELEVATION_FADE_MIN_RAD),
      0,
      1
    );

    // Combined visibility envelope: the unified grid fade gates the whole
    // element, the elevation fade gates only readability at grazing angles.
    const effectiveFade = elevationFade * gridFade;

    // Build the candidate label list: every MAJOR ring. Priority: the
    // dominant ("current scale") ring first, then nearer rings (smaller
    // radius) — so on a collision the dominant + nearer labels win.
    const majors = rings.filter((r) => r.major);
    const candidates = majors
      .map((r) => ({
        au: r.au,
        radius: r.radius,
        dominant: Math.abs(r.au - labelAU) < 1e-9,
      }))
      .sort((a, b) => {
        if (a.dominant !== b.dominant) return a.dominant ? -1 : 1;
        return a.radius - b.radius;
      });

    // Declutter in priority order: project each candidate's world position
    // to NDC and keep it only if it clears every already-kept label by the
    // minimum screen gap. Then assign kept candidates to pool slots.
    const keptNdcY: number[] = [];
    const assigned: Array<{
      au: number;
      radius: number;
      dominant: boolean;
    }> = [];
    for (const c of candidates) {
      if (assigned.length >= LABEL_POOL_SIZE) break;
      TMP_WORLD.set(
        TMP_GROUND_HEADING.x * c.radius,
        planeY,
        TMP_GROUND_HEADING.z * c.radius
      );
      TMP_WORLD.project(camera);
      // Behind the camera (z > 1) or far off-screen → still allow (it may
      // be partially visible); declutter purely on the screen-Y stack.
      const ndcY = TMP_WORLD.y;
      let collides = false;
      for (const y of keptNdcY) {
        if (Math.abs(y - ndcY) < DECLUTTER_MIN_NDC_GAP) {
          collides = true;
          break;
        }
      }
      if (collides) continue;
      keptNdcY.push(ndcY);
      assigned.push(c);
    }

    // Drive the pool: assigned[i] → slot i; surplus slots hidden.
    for (let i = 0; i < LABEL_POOL_SIZE; i++) {
      const slot = slots.current[i];
      const group = slot.group;
      if (!group) continue;
      const c = assigned[i];
      if (!c || effectiveFade <= 0.01) {
        group.visible = false;
        continue;
      }
      group.visible = true;

      // Position ON the ring (Sun-centered radius), flat on the plane.
      group.position.set(
        TMP_GROUND_HEADING.x * c.radius,
        planeY,
        TMP_GROUND_HEADING.z * c.radius
      );
      // Lay flat + in-plane spin toward the camera heading (YXZ order).
      group.rotation.order = "YXZ";
      group.rotation.set(-Math.PI / 2, azimuth, 0);

      // Screen-stable size: scale with camera distance so the on-screen
      // pixel height stays ~constant (never balloons close-up). The
      // dominant label is larger. Capped at the top end.
      const distance = group.position.distanceTo(camera.position);
      const base = c.dominant ? FONT_WORLD_BASE_DOMINANT : FONT_WORLD_BASE;
      const rawScale = (distance / FONT_DISTANCE_DIVISOR) * base;
      group.scale.setScalar(Math.min(rawScale, LABEL_SCALE_MAX_WORLD_UNITS));

      // Publish this label's screen footprint so `OverlayPositionTracker`
      // can arbitrate body labels against it. Without this the two passes
      // are individually tidy and jointly broken — captures showed "1 AU"
      // struck through "MOON", and "EARTH" in another framing.
      //
      // The height is the constant on-screen size the scale above is built
      // to produce: worldSize/distance cancels, leaving base/divisor times
      // the viewport's pixels-per-radian. Width is estimated from the glyph
      // count; a declutter margin does not need to be exact.
      // Text + opacity. The dominant label reads at full opacity; the rest
      // slightly dimmer so the "current scale" reads prominently.
      const nextText = formatDecadeScaleLabel(c.au, allowLY);

      // Publish this label's screen footprint so `OverlayPositionTracker`
      // can arbitrate body labels against it. Without this the two passes
      // are individually tidy and jointly broken — captures showed "1 AU"
      // struck through "MOON", and "EARTH" in another framing.
      //
      // Height is the constant on-screen size the scale above is built to
      // produce: worldSize/distance cancels, leaving base/divisor times the
      // viewport's pixels-per-radian. Width is estimated from the glyph
      // count — a declutter margin does not need to be exact. Skipped while
      // the label is faint enough not to interfere.
      if (effectiveFade > 0.35) {
        TMP_WORLD.copy(group.position).project(camera);
        const hPx =
          (base / FONT_DISTANCE_DIVISOR) * pixelsPerWorldUnitAtUnitDepth;
        const wPx = nextText.length * hPx * 0.72;
        reserveLabelBox(frame, {
          x: ((TMP_WORLD.x + 1) / 2) * viewportWidth - wPx / 2,
          y: ((1 - TMP_WORLD.y) / 2) * viewportHeight - hPx / 2,
          w: wPx,
          h: hPx,
        });
      }

      const textMesh = slot.text;
      if (textMesh) {
        if (nextText !== slot.lastText) {
          // troika reads the JSX child; we mutate the `text` prop via the
          // underlying troika object to avoid a React re-render per frame.
          const troika = textMesh as unknown as {
            text?: string;
            sync?: () => void;
          };
          if ("text" in troika) {
            troika.text = nextText;
            troika.sync?.();
          }
          slot.lastText = nextText;
        }
        const mat = textMesh.material as THREE.Material | THREE.Material[];
        const single = Array.isArray(mat) ? mat[0] : mat;
        if (single) {
          single.transparent = true;
          single.depthWrite = false;
          single.opacity = effectiveFade * (c.dominant ? 1 : 0.7);
        }
      }
    }
  });

  return (
    <group raycast={noopRaycast}>
      {Array.from({ length: LABEL_POOL_SIZE }, (_, i) => (
        <group
          key={i}
          ref={(g: THREE.Group | null) => {
            slots.current[i].group = g;
          }}
          visible={false}
          raycast={noopRaycast}
        >
          <Text
            ref={(t: THREE.Mesh | null) => {
              slots.current[i].text = t;
            }}
            fontSize={1}
            color={ACCENT_TEAL}
            anchorX="center"
            anchorY="middle"
            letterSpacing={0.15}
            renderOrder={GRID_RECURSIVE_CONFIG.renderOrder + 2}
            // Soft dark halo, not a hard stroke. The previous glow used
            // ACCENT_TEAL — the ring's own colour — so a ring passing behind
            // the glyphs never visually terminated: the line read through the
            // letter counters and merged with the strokes ("10 AU" scanned as
            // "1.0 AU"). A near-black halo at high blur keeps the soft HUD
            // feel while giving the glyphs somewhere to sit.
            outlineWidth="6%"
            outlineBlur="55%"
            outlineColor={LABEL_HALO}
            outlineOpacity={0.85}
            raycast={noopRaycast}
          >
            {""}
          </Text>
        </group>
      ))}
    </group>
  );
};
