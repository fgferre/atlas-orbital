import { useMemo } from "react";
import * as THREE from "three";
import { useStore } from "../store";
import { orbitalEngine } from "../lib/orbital";
import type { OrbitalPositionResult } from "../lib/orbital";

/**
 * Discriminated-union result type for orbital hooks.
 *
 * Replaces the previous `T | null` return so callers must explicitly
 * handle the error branch instead of silently treating "failed" and
 * "not yet" the same way.
 */
export type OrbitalResult<T> =
  | { state: "ready"; data: T }
  | { state: "error"; error: Error };

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

/**
 * Internal helper: execute `compute` and wrap the outcome in an
 * `OrbitalResult`. Exported for unit testing — hooks compose this
 * around their memoized inputs.
 *
 * @internal
 */
export function resolveOrbitalResult<T>(
  label: string,
  compute: () => T
): OrbitalResult<T> {
  try {
    return { state: "ready", data: compute() };
  } catch (error) {
    console.error(`[${label}] Failed:`, error);
    return { state: "error", error: toError(error) };
  }
}

/**
 * Hook to calculate orbital position for a body
 * Uses the orbital engine with caching
 */
export function useOrbitalPosition(
  bodyId: string,
  parentId?: string
): OrbitalResult<THREE.Vector3> {
  const datetime = useStore((state) => state.displayedDatetime);

  return useMemo(
    () =>
      resolveOrbitalResult(`useOrbitalPosition:${bodyId}`, () =>
        orbitalEngine
          .calculatePosition(bodyId, datetime, parentId)
          .position.clone()
      ),
    [bodyId, parentId, datetime]
  );
}

/**
 * Hook to get orbital calculation result for a body
 * Includes position, elements, and provenance
 */
export function useOrbitalCalculation(
  bodyId: string,
  parentId?: string
): OrbitalResult<OrbitalPositionResult> {
  const datetime = useStore((state) => state.displayedDatetime);

  return useMemo(
    () =>
      resolveOrbitalResult(`useOrbitalCalculation:${bodyId}`, () =>
        orbitalEngine.calculatePosition(bodyId, datetime, parentId)
      ),
    [bodyId, parentId, datetime]
  );
}

/**
 * Hook to get orbital provenance for a body
 */
export function useOrbitalProvenance(bodyId: string): {
  model: string;
  provider: string;
  isFallback: boolean;
  plannedModel?: string;
  validityNote?: string;
} {
  const datetime = useStore((state) => state.displayedDatetime);

  return useMemo(() => {
    return orbitalEngine.getProvenance(bodyId, datetime);
  }, [bodyId, datetime]);
}

/**
 * Hook to get osculating elements for a body
 */
export function useOsculatingElements(bodyId: string): {
  a: number;
  e: number;
  i: number;
  O: number;
  w: number;
  M: number;
  n: number;
} | null {
  const datetime = useStore((state) => state.displayedDatetime);

  return useMemo(() => {
    return orbitalEngine.getOsculatingElements(bodyId, datetime);
  }, [bodyId, datetime]);
}

/**
 * Hook to batch calculate positions for multiple bodies
 * Note: Returns a new Map on each recalculation - use with caution
 */
export function useOrbitalPositions(
  bodies: Array<{ bodyId: string; parentId?: string }>
): OrbitalResult<Map<string, THREE.Vector3>> {
  const datetime = useStore((state) => state.displayedDatetime);

  return useMemo(
    () =>
      resolveOrbitalResult("useOrbitalPositions", () => {
        const results = orbitalEngine.calculatePositions(bodies, datetime);
        const positions = new Map<string, THREE.Vector3>();
        for (const [bodyId, result] of results) {
          positions.set(bodyId, result.position.clone());
        }
        return positions;
      }),
    [bodies, datetime]
  );
}
