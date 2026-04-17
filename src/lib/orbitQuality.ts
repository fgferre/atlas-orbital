export type OrbitProfile = "ultra" | "high" | "balanced" | "constrained";

export type OrbitScaleMode = "didactic" | "realistic";

export interface OrbitSegmentsArgs {
  bodyId: string;
  focusId: string | null;
  orbitProfile: OrbitProfile;
}

export interface OrbitCacheKeyArgs extends OrbitSegmentsArgs {
  scaleMode: OrbitScaleMode;
  dateBucket?: string;
}

export interface OrbitAncestryNode {
  id: string;
  parentId?: string | null;
}

const SEGMENTS_BY_PROFILE: Record<OrbitProfile, number> = {
  ultra: 4096,
  high: 4096,
  balanced: 2048,
  constrained: 1024,
};

export function getOrbitSegments({
  bodyId,
  focusId,
  orbitProfile,
}: OrbitSegmentsArgs): number {
  if (bodyId === focusId) {
    return 16384;
  }

  return SEGMENTS_BY_PROFILE[orbitProfile];
}

export function getOrbitCacheKey({
  bodyId,
  focusId,
  orbitProfile,
  scaleMode,
  dateBucket,
}: OrbitCacheKeyArgs): string {
  const segments = getOrbitSegments({ bodyId, focusId, orbitProfile });
  return [bodyId, scaleMode, segments, dateBucket]
    .filter((part) => part !== undefined)
    .join(":");
}

export function getOrbitAncestryIds(
  bodyId: string,
  parentById: Record<string, string | null | undefined>
): string[] {
  const ancestry: string[] = [];
  const seen = new Set<string>();
  let currentParentId = parentById[bodyId] ?? null;

  while (currentParentId) {
    if (seen.has(currentParentId)) {
      break;
    }

    seen.add(currentParentId);
    ancestry.push(currentParentId);
    currentParentId = parentById[currentParentId] ?? null;
  }

  return ancestry;
}
