import { useMemo } from "react";
import { type CelestialBody } from "../../../lib/astrophysics";
import {
  BODIES_BY_ID,
  SOLAR_SYSTEM_BODIES,
} from "../../../data/celestialBodies";

const PARENT_BY_ID = Object.fromEntries(
  SOLAR_SYSTEM_BODIES.map((body) => [body.id, body.parentId ?? null])
);

interface OrbitalSalienceResult {
  orbitSalience: number;
  assetPriority: number;
  baseTextureSalience: number;
  focusAncestorIds: Set<string>;
}

export function useOrbitalSalience(
  body: CelestialBody,
  focusId: string | null,
  declutterOrbits: boolean
): OrbitalSalienceResult {
  const focusAncestorIds = useMemo(() => {
    if (!focusId) return new Set<string>();

    const ancestors = new Set<string>();
    let curParentId = PARENT_BY_ID[focusId] ?? null;

    while (curParentId) {
      if (ancestors.has(curParentId)) break;
      ancestors.add(curParentId);
      curParentId = PARENT_BY_ID[curParentId] ?? null;
    }

    return ancestors;
  }, [focusId]);

  const orbitSalience = useMemo(() => {
    if (!declutterOrbits) return 1;

    // In overview, keep the scene clean by default.
    if (!focusId) {
      if (body.type === "planet" || body.type === "dwarf") return 1;
      return 0;
    }

    if (body.id === focusId) return 1;

    const focusBody = BODIES_BY_ID.get(focusId);
    if (!focusBody) return 1;
    const isSolarOverviewBody =
      focusId === "sun" &&
      !body.parentId &&
      (body.type === "planet" || (body.type === "dwarf" && body.orbit.a <= 40));

    // 1) Emphasize direct context: children and siblings.
    if (isSolarOverviewBody) return 0.55;
    if (body.parentId === focusId) return 0.55;
    if (focusBody.parentId && body.parentId === focusBody.parentId) return 0.25;

    // 2) Keep the ancestry chain visible (e.g., Moon -> Earth -> Sun).
    if (focusAncestorIds.has(body.id)) return 0.45;

    // 3) Keep major bodies faintly for global orientation.
    if (body.type === "planet" || body.type === "dwarf") return 0.08;

    return 0.02;
  }, [
    body.id,
    body.orbit.a,
    body.parentId,
    body.type,
    declutterOrbits,
    focusAncestorIds,
    focusId,
  ]);

  const assetPriority = useMemo(() => {
    if (body.id === "sun") return 0;

    if (!focusId) {
      return body.type === "planet" || body.type === "dwarf" ? 1 : 2;
    }

    if (body.id === focusId) return 0;

    const focusBody = BODIES_BY_ID.get(focusId);
    if (!focusBody) return 1;
    const isSolarOverviewBody =
      focusId === "sun" &&
      !body.parentId &&
      (body.type === "planet" || (body.type === "dwarf" && body.orbit.a <= 40));

    if (isSolarOverviewBody) return 1;
    if (body.parentId === focusId) return 1;
    if (focusBody.parentId && body.parentId === focusBody.parentId) return 1;
    if (focusAncestorIds.has(body.id)) return 1;
    if (body.type === "planet" || body.type === "dwarf") return 2;

    return 3;
  }, [
    body.id,
    body.orbit.a,
    body.parentId,
    body.type,
    focusAncestorIds,
    focusId,
  ]);

  const baseTextureSalience = useMemo(() => {
    if (body.id === "sun") return 1;
    if (assetPriority === 0) return 1;
    if (assetPriority === 1) return 0.72;
    if (assetPriority === 2) return 0.38;
    return 0.14;
  }, [assetPriority, body.id]);

  return useMemo(
    () => ({
      orbitSalience,
      assetPriority,
      baseTextureSalience,
      focusAncestorIds,
    }),
    [orbitSalience, assetPriority, baseTextureSalience, focusAncestorIds]
  );
}
