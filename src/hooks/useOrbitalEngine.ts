import { useMemo } from "react";
import * as THREE from "three";
import { useStore } from "../store";
import { orbitalEngine } from "../lib/orbital";
import type { OrbitalPositionResult } from "../lib/orbital";

/**
 * Hook to calculate orbital position for a body
 * Uses the orbital engine with caching
 */
export function useOrbitalPosition(
  bodyId: string,
  parentId?: string
): THREE.Vector3 | null {
  const datetime = useStore((state) => state.displayedDatetime);

  return useMemo(() => {
    try {
      const result = orbitalEngine.calculatePosition(
        bodyId,
        datetime,
        parentId
      );
      return result.position.clone();
    } catch (error) {
      console.error(`[useOrbitalPosition] Failed for ${bodyId}:`, error);
      return null;
    }
  }, [bodyId, parentId, datetime]);
}

/**
 * Hook to get orbital calculation result for a body
 * Includes position, elements, and provenance
 */
export function useOrbitalCalculation(
  bodyId: string,
  parentId?: string
): OrbitalPositionResult | null {
  const datetime = useStore((state) => state.displayedDatetime);

  return useMemo(() => {
    try {
      return orbitalEngine.calculatePosition(bodyId, datetime, parentId);
    } catch (error) {
      console.error(`[useOrbitalCalculation] Failed for ${bodyId}:`, error);
      return null;
    }
  }, [bodyId, parentId, datetime]);
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
): Map<string, THREE.Vector3> {
  const datetime = useStore((state) => state.displayedDatetime);

  return useMemo(() => {
    const results = orbitalEngine.calculatePositions(bodies, datetime);
    const positions = new Map<string, THREE.Vector3>();

    for (const [bodyId, result] of results) {
      positions.set(bodyId, result.position.clone());
    }

    return positions;
  }, [bodies, datetime]);
}
