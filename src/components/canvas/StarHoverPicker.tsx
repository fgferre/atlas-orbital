/**
 * HYG hover picker.
 *
 * Renders nothing. Lives inside the R3F `<Canvas>` so it has access to the
 * camera and GL surface via `useThree`. Listens to pointer moves on the
 * canvas, projects the named-star subset to screen space, and when the
 * pointer lingers on the closest candidate for `HOVER_SUSTAIN_MS` it
 * writes the hover to the store (`hoveredStar`). The HTML
 * `<StarHoverTooltip />` outside the Canvas picks up the same store slice
 * and renders the tooltip.
 *
 * Design notes:
 * - Only named stars (from `hyg-v1.names.json`) are pickable — that's the
 *   ~3 000-entry subset users actually care about. Iterating every frame
 *   over the full 109 k catalog would be wasteful.
 * - Proper motion is ignored in the pick because the offset over normal
 *   simulation spans is well below the 12-pixel pick threshold even for
 *   high-PM stars like Barnard's. If that ever matters we can animate
 *   the pick positions the same way the vertex shader does.
 * - Mouse moves are throttled to ~33 Hz so the per-move projection cost
 *   stays invisible even on laptops.
 * - Disabled on the `constrained` device tier (the hook unmounts its
 *   listener entirely so there is zero CPU cost on weak devices).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useStore } from "../../store";
import { useQualityProfile } from "../../hooks/useQualityProfile";
import { formatHygFocusId } from "../../lib/focus/hygFocusResolver";
import {
  getCachedHygCatalog,
  getCachedHygNamesSidecar,
  hygTierForQuality,
  loadHygCatalog,
  loadHygNamesSidecar,
  type HoveredStarInfo,
  type HygCatalogData,
  type HygNamedStar,
  type HygNamesSidecar,
} from "../../lib/starfield";
import { useStarfieldCatalog } from "./useStarfieldCatalog";

const HOVER_PICK_THRESHOLD_PX = 12;
const HOVER_SUSTAIN_MS = 200;
const MOUSE_THROTTLE_MS = 32; // ~30 Hz

// Pre-scaled position is `(x, y, z) * DISTANCE_SCALE`, matching the
// constant used in `Starfield.tsx` so the world-space projection lines up
// with the rendered points.
const DISTANCE_SCALE = 206_265_000.0;
// The starfield's root billboard mesh is rotated around X by the J2000
// obliquity; we bake that into the world transform once per mouse move
// instead of traversing the scene graph.
const OBLIQUITY_RAD = (23.4 * Math.PI) / 180;

/**
 * Per-named-star pick entry. Pre-computed once the catalog + sidecar both
 * land, so every mouse move is O(N) projections and nothing else.
 */
interface PickCandidate {
  entry: HygNamedStar;
  /** World-space rotated position matching the rendered point. */
  x: number;
  y: number;
  z: number;
  /** Distance from the solar system in parsecs, or null when unknown. */
  distanceParsecs: number | null;
  /** B-V colour index carried through so the tooltip can tint the chip. */
  colorIndex: number;
}

function buildPickCandidates(
  catalog: HygCatalogData,
  sidecar: HygNamesSidecar
): PickCandidate[] {
  const out: PickCandidate[] = [];
  const cosT = Math.cos(OBLIQUITY_RAD);
  const sinT = Math.sin(OBLIQUITY_RAD);
  const count = catalog.header.count;

  for (const entry of sidecar.entries) {
    // The Low tier only carries ~500 stars; named entries referring to
    // dimmer stars skip silently until a richer tier is loaded.
    if (entry.index < 0 || entry.index >= count) continue;

    const i = entry.index * 3;
    const px = catalog.positions[i] * DISTANCE_SCALE;
    const py = catalog.positions[i + 1] * DISTANCE_SCALE;
    const pz = catalog.positions[i + 2] * DISTANCE_SCALE;

    // Apply the same R_x(obliquity) the starfield mesh applies in the scene.
    const rx = px;
    const ry = py * cosT - pz * sinT;
    const rz = py * sinT + pz * cosT;

    const distParsecs = Math.sqrt(px * px + py * py + pz * pz) / DISTANCE_SCALE;

    out.push({
      entry,
      x: rx,
      y: ry,
      z: rz,
      distanceParsecs: Number.isFinite(distParsecs) ? distParsecs : null,
      colorIndex: catalog.colorIndices[entry.index] ?? 0.6,
    });
  }

  return out;
}

export const StarHoverPicker = () => {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const starfieldSource = useStore((s) => s.starfieldSource);
  const showStarfield = useStore((s) => s.showStarfield);
  const qualityMode = useStore((s) => s.qualityMode);
  const setHoveredStar = useStore((s) => s.setHoveredStar);
  // T6.3-β: click → focus dispatch. setFocusId accepts any string;
  // routes "hyg:K"-prefixed IDs through the T6.0 fallback branch in
  // CameraController (proximity-damping useEffect), and HygStellarMesh
  // consumes the same focusId to spawn the procedural mesh when the
  // T6.3-α hysteresis gate fires.
  const setFocusId = useStore((s) => s.setFocusId);

  const qualityProfile = useQualityProfile(qualityMode);
  const tier = hygTierForQuality(qualityProfile.name);

  // Hover picking is only meaningful when HYG is the live preset, the
  // user has the starfield visible, and the device tier is not the
  // constrained one (where we are already running with 500 stars and do
  // not want to spend any CPU on interaction). Changing any of these
  // flags tears the listener down.
  const enabled =
    starfieldSource === "hyg" &&
    showStarfield &&
    qualityProfile.name !== "constrained";

  // Subscribe to the same tier-bound catalog `<Starfield />` is rendering
  // from. Going through `useStarfieldCatalog` (rather than peeking at the
  // module cache directly) is what guarantees we re-run `buildPickCandidates`
  // when the catalog finishes loading: without this subscription the hover
  // picker could silently stay disabled if the sidecar happened to resolve
  // before the tier binary did (caught by Codex review of 2026-04-17).
  const loadCatalogForTier = useCallback(() => loadHygCatalog(tier), [tier]);
  const getCachedCatalogForTier = useCallback(
    () => getCachedHygCatalog(tier),
    [tier]
  );
  const catalog = useStarfieldCatalog<HygCatalogData>({
    source: "hyg",
    loadCatalog: loadCatalogForTier,
    getCachedCatalog: getCachedCatalogForTier,
  });

  // Lazy-load the names sidecar the first time the picker is enabled.
  // Same render-derives-from-cache pattern as the catalog below so a
  // parallel loader (hypothetical future one) populates us for free.
  const cachedSidecar = getCachedHygNamesSidecar();
  const [loadedSidecar, setLoadedSidecar] = useState<HygNamesSidecar | null>(
    null
  );
  const sidecar = cachedSidecar ?? loadedSidecar;

  useEffect(() => {
    if (!enabled || sidecar) return;
    let cancelled = false;
    loadHygNamesSidecar()
      .then((payload) => {
        if (cancelled) return;
        setLoadedSidecar(payload);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.warn("HYG names sidecar load failed:", error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, sidecar]);

  // Build the pick table whenever either half becomes available.
  // Both `catalog` and `sidecar` are reactive, so whichever finishes
  // last triggers the recompute — no race.
  const candidates = useMemo<PickCandidate[]>(() => {
    if (!enabled || !sidecar || !catalog) return [];
    return buildPickCandidates(catalog, sidecar);
  }, [enabled, catalog, sidecar]);

  useEffect(() => {
    if (!enabled) {
      setHoveredStar(null);
      return;
    }
    const canvas = gl.domElement;
    if (!canvas) return;

    // State that survives across mousemove events without triggering
    // React re-renders.
    let lastEvaluatedAt = 0;
    let sustainTimer: number | null = null;
    let pendingCandidate: PickCandidate | null = null;
    let pendingScreenX = 0;
    let pendingScreenY = 0;

    const clearSustain = () => {
      if (sustainTimer !== null) {
        window.clearTimeout(sustainTimer);
        sustainTimer = null;
      }
    };

    const evaluate = (clientX: number, clientY: number) => {
      // Canvas-relative coordinates (handles retina DPR via clientWidth).
      const rect = canvas.getBoundingClientRect();
      const cursorX = clientX - rect.left;
      const cursorY = clientY - rect.top;
      if (
        cursorX < 0 ||
        cursorY < 0 ||
        cursorX > rect.width ||
        cursorY > rect.height
      ) {
        clearSustain();
        pendingCandidate = null;
        setHoveredStar(null);
        canvas.style.cursor = "";
        return;
      }

      // Project each candidate into NDC, convert to pixels, keep the
      // closest within the pick threshold.
      const projected = new THREE.Vector3();
      let best: PickCandidate | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      let bestX = 0;
      let bestY = 0;

      const widthPx = rect.width;
      const heightPx = rect.height;

      for (const c of candidates) {
        projected.set(c.x, c.y, c.z);
        projected.project(camera);
        // Reject stars behind the camera or wildly out of frustum.
        if (projected.z < -1 || projected.z > 1) continue;

        const sx = (projected.x * 0.5 + 0.5) * widthPx;
        const sy = (1 - (projected.y * 0.5 + 0.5)) * heightPx;
        const dx = sx - cursorX;
        const dy = sy - cursorY;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) {
          bestDist = d2;
          best = c;
          bestX = sx;
          bestY = sy;
        }
      }

      const hit =
        best !== null && Math.sqrt(bestDist) <= HOVER_PICK_THRESHOLD_PX
          ? best
          : null;

      // Cursor feedback is immediate: the moment the pointer is on a
      // candidate, we switch to `pointer` to signal interactivity.
      canvas.style.cursor = hit ? "pointer" : "";

      if (!hit) {
        clearSustain();
        pendingCandidate = null;
        setHoveredStar(null);
        return;
      }

      if (pendingCandidate?.entry.index === hit.entry.index) {
        // Same candidate as before — let the sustain timer run.
        pendingScreenX = bestX;
        pendingScreenY = bestY;
        return;
      }

      // Switched candidates → restart the sustain timer.
      clearSustain();
      pendingCandidate = hit;
      pendingScreenX = bestX;
      pendingScreenY = bestY;
      sustainTimer = window.setTimeout(() => {
        if (!pendingCandidate) return;
        const info: HoveredStarInfo = {
          entry: pendingCandidate.entry,
          distanceParsecs: pendingCandidate.distanceParsecs,
          colorIndex: pendingCandidate.colorIndex,
          screenX: pendingScreenX,
          screenY: pendingScreenY,
        };
        setHoveredStar(info);
      }, HOVER_SUSTAIN_MS);
    };

    const onMouseMove = (event: MouseEvent) => {
      const now = performance.now();
      if (now - lastEvaluatedAt < MOUSE_THROTTLE_MS) return;
      lastEvaluatedAt = now;
      evaluate(event.clientX, event.clientY);
    };

    const onLeave = () => {
      clearSustain();
      pendingCandidate = null;
      setHoveredStar(null);
      canvas.style.cursor = "";
    };

    // T6.3-β: click → focus dispatch. Re-projects the current click
    // position against the candidate set (no reliance on
    // `pendingCandidate` / hover sustain — clicking should focus
    // even if the user clicks before the 200 ms hover threshold).
    // Closure-captures `candidates` from the useEffect's deps so a
    // catalog-flip recomputes the pick set automatically.
    const onClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      if (
        cursorX < 0 ||
        cursorY < 0 ||
        cursorX > rect.width ||
        cursorY > rect.height
      )
        return;

      const projected = new THREE.Vector3();
      let best: PickCandidate | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      const widthPx = rect.width;
      const heightPx = rect.height;
      for (const c of candidates) {
        projected.set(c.x, c.y, c.z);
        projected.project(camera);
        if (projected.z < -1 || projected.z > 1) continue;
        const sx = (projected.x * 0.5 + 0.5) * widthPx;
        const sy = (1 - (projected.y * 0.5 + 0.5)) * heightPx;
        const dx = sx - cursorX;
        const dy = sy - cursorY;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) {
          bestDist = d2;
          best = c;
        }
      }
      if (best !== null && Math.sqrt(bestDist) <= HOVER_PICK_THRESHOLD_PX) {
        setFocusId(formatHygFocusId(best.entry.index));
      }
    };

    canvas.addEventListener("mousemove", onMouseMove, { passive: true });
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("click", onClick);

    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("click", onClick);
      clearSustain();
      setHoveredStar(null);
      canvas.style.cursor = "";
    };
  }, [enabled, gl, camera, candidates, setHoveredStar, setFocusId]);

  return null;
};
