import { describe, expect, it } from "vitest";

import {
  STELLAR_MESH_ENTER_RAD,
  STELLAR_MESH_EXIT_RAD,
  SUN_RADIUS_WORLD_UNITS,
  computeStellarSolidAngle,
  shouldStellarMeshBeActive,
} from "./stellarMeshGate";

describe("threshold constants", () => {
  it("ENTER_RAD = 1e-3 rad (~0.057°)", () => {
    expect(STELLAR_MESH_ENTER_RAD).toBe(1e-3);
  });

  it("EXIT_RAD = 5e-4 rad (~0.029°)", () => {
    expect(STELLAR_MESH_EXIT_RAD).toBe(5e-4);
  });

  it("ENTER is exactly 2x EXIT (hysteresis cushion)", () => {
    expect(STELLAR_MESH_ENTER_RAD).toBe(STELLAR_MESH_EXIT_RAD * 2);
  });

  it("SUN_RADIUS_WORLD_UNITS ≈ 4.654 (1 AU = 1000 wu, Sun radius 696,340 km)", () => {
    expect(SUN_RADIUS_WORLD_UNITS).toBeCloseTo(4.654, 2);
  });

  it("SUN_RADIUS_WORLD_UNITS matches the LensFlareInjector.tsx:68 literal", () => {
    // Pin the formula to catch drift if either site updates without the other.
    expect(SUN_RADIUS_WORLD_UNITS).toBe((696_340 / 149_597_870.7) * 1000);
  });
});

describe("computeStellarSolidAngle", () => {
  it("returns radius / distance for typical inputs", () => {
    expect(computeStellarSolidAngle(1, 1000)).toBe(0.001);
    expect(computeStellarSolidAngle(4.654, 4654)).toBeCloseTo(0.001, 6);
  });

  it("Sun at Earth distance (1 AU = 1000 wu) → ~0.00465 rad (~0.27°)", () => {
    // Real Sun apparent radius from Earth ≈ 0.27° = 4.65e-3 rad. Pinned.
    const sa = computeStellarSolidAngle(SUN_RADIUS_WORLD_UNITS, 1000);
    expect(sa).toBeCloseTo(4.654e-3, 5);
  });

  it("Sirius at 100 AU equivalent (a sample HYG zoom-in distance) → above ENTER threshold", () => {
    // Sirius ~1.66 R_sun → 1.66 * 4.654 = 7.72 wu. At distance 5000 wu
    // (~5 AU), solidAngle ≈ 1.55e-3 rad — above ENTER, mesh would spawn.
    const sa = computeStellarSolidAngle(7.72, 5000);
    expect(sa).toBeGreaterThan(STELLAR_MESH_ENTER_RAD);
  });

  it("Proxima at typical viewing distance → below EXIT threshold (sprite stays)", () => {
    // Proxima ~0.235 R_sun → 0.235 * 4.654 = 1.09 wu. At distance 10,000 wu
    // (~10 AU), solidAngle ≈ 1.09e-4 rad — well below EXIT, no mesh.
    const sa = computeStellarSolidAngle(1.09, 10_000);
    expect(sa).toBeLessThan(STELLAR_MESH_EXIT_RAD);
  });

  it("returns 0 for non-finite inputs (defensive)", () => {
    expect(computeStellarSolidAngle(NaN, 1000)).toBe(0);
    expect(computeStellarSolidAngle(1, NaN)).toBe(0);
    expect(computeStellarSolidAngle(Infinity, 1000)).toBe(0);
    expect(computeStellarSolidAngle(1, Infinity)).toBe(0);
  });

  it("returns 0 for zero / negative distance (defensive)", () => {
    expect(computeStellarSolidAngle(1, 0)).toBe(0);
    expect(computeStellarSolidAngle(1, -100)).toBe(0);
  });

  it("returns 0 for zero / negative radius (defensive)", () => {
    expect(computeStellarSolidAngle(0, 1000)).toBe(0);
    expect(computeStellarSolidAngle(-1, 1000)).toBe(0);
  });
});

describe("shouldStellarMeshBeActive — hysteresis from inactive state", () => {
  it("spawns when solidAngle > ENTER", () => {
    expect(shouldStellarMeshBeActive(false, 2e-3)).toBe(true);
    expect(shouldStellarMeshBeActive(false, 5e-3)).toBe(true);
  });

  it("does NOT spawn when solidAngle === ENTER (strict inequality)", () => {
    // Boundary is a no-op zone — strict > avoids float-equality flapping.
    expect(shouldStellarMeshBeActive(false, STELLAR_MESH_ENTER_RAD)).toBe(
      false
    );
  });

  it("does NOT spawn when solidAngle below ENTER but above EXIT (hysteresis dead-zone)", () => {
    // Half-way between EXIT (5e-4) and ENTER (1e-3): 7.5e-4. From inactive,
    // this should stay inactive (need to cross ENTER to spawn).
    expect(shouldStellarMeshBeActive(false, 7.5e-4)).toBe(false);
  });

  it("does NOT spawn when solidAngle <= EXIT", () => {
    expect(shouldStellarMeshBeActive(false, STELLAR_MESH_EXIT_RAD)).toBe(false);
    expect(shouldStellarMeshBeActive(false, 1e-4)).toBe(false);
    expect(shouldStellarMeshBeActive(false, 0)).toBe(false);
  });
});

describe("shouldStellarMeshBeActive — hysteresis from active state", () => {
  it("stays active when solidAngle >= EXIT", () => {
    expect(shouldStellarMeshBeActive(true, STELLAR_MESH_EXIT_RAD)).toBe(true);
    expect(shouldStellarMeshBeActive(true, 1e-3)).toBe(true);
    expect(shouldStellarMeshBeActive(true, 5e-3)).toBe(true);
  });

  it("stays active in the hysteresis dead-zone (between EXIT and ENTER)", () => {
    // 7.5e-4 is below ENTER but above EXIT — active state persists.
    expect(shouldStellarMeshBeActive(true, 7.5e-4)).toBe(true);
  });

  it("despawns when solidAngle < EXIT", () => {
    expect(shouldStellarMeshBeActive(true, 4e-4)).toBe(false);
    expect(shouldStellarMeshBeActive(true, 1e-4)).toBe(false);
    expect(shouldStellarMeshBeActive(true, 0)).toBe(false);
  });
});

describe("shouldStellarMeshBeActive — full zoom cycle", () => {
  it("inactive → spawn → stay → despawn → stay → spawn (hysteresis cycle)", () => {
    // Walk through a hypothetical zoom-in/zoom-out cycle:
    //
    // sa  | wasActive | result
    // ----+-----------+--------
    // 1e-4 | false    | false  (sprite, far)
    // 7e-4 | false    | false  (sprite, dead-zone — not yet crossed ENTER)
    // 2e-3 | false    | true   (mesh spawns, ENTER crossed)
    // 9e-4 | true     | true   (mesh persists, dead-zone — not crossed EXIT)
    // 4e-4 | true     | false  (mesh despawns, EXIT crossed)
    // 7e-4 | false    | false  (sprite, dead-zone again — must cross ENTER)
    // 2e-3 | false    | true   (mesh spawns again)
    let active = false;
    active = shouldStellarMeshBeActive(active, 1e-4);
    expect(active).toBe(false);
    active = shouldStellarMeshBeActive(active, 7e-4);
    expect(active).toBe(false);
    active = shouldStellarMeshBeActive(active, 2e-3);
    expect(active).toBe(true);
    active = shouldStellarMeshBeActive(active, 9e-4);
    expect(active).toBe(true);
    active = shouldStellarMeshBeActive(active, 4e-4);
    expect(active).toBe(false);
    active = shouldStellarMeshBeActive(active, 7e-4);
    expect(active).toBe(false);
    active = shouldStellarMeshBeActive(active, 2e-3);
    expect(active).toBe(true);
  });

  it("preserves state across NaN inputs (defensive)", () => {
    // A frame with NaN solidAngle (e.g. division by zero on first frame
    // before camera position is set) should not flip the mesh.
    expect(shouldStellarMeshBeActive(false, NaN)).toBe(false);
    expect(shouldStellarMeshBeActive(true, NaN)).toBe(true);
  });
});

describe("integration sanity — gate against computeStellarSolidAngle", () => {
  it("Sirius at 1 AU → mesh spawns", () => {
    // Sirius ~1.66 R_sun → 7.72 wu. Distance 1 AU = 1000 wu.
    // sa = 7.72 / 1000 = 7.72e-3 → above ENTER (1e-3) → spawn.
    const sa = computeStellarSolidAngle(7.72, 1000);
    expect(sa).toBeGreaterThan(STELLAR_MESH_ENTER_RAD);
    expect(shouldStellarMeshBeActive(false, sa)).toBe(true);
  });

  it("Sirius at 100 AU → no mesh (sprite only)", () => {
    // Sirius at 100 AU = 100,000 wu. sa = 7.72 / 100,000 = 7.72e-5 →
    // below EXIT → no spawn from inactive.
    const sa = computeStellarSolidAngle(7.72, 100_000);
    expect(sa).toBeLessThan(STELLAR_MESH_EXIT_RAD);
    expect(shouldStellarMeshBeActive(false, sa)).toBe(false);
  });

  it("Betelgeuse at 1000 AU → mesh spawns (giant compensates for distance)", () => {
    // Betelgeuse ~1000 R_sun (T6.2 luminosity-class lookup) → 4654 wu.
    // Distance 1000 AU = 1,000,000 wu. sa = 4654 / 1,000,000 = 4.65e-3 →
    // above ENTER → spawn.
    const sa = computeStellarSolidAngle(4654, 1_000_000);
    expect(sa).toBeGreaterThan(STELLAR_MESH_ENTER_RAD);
    expect(shouldStellarMeshBeActive(false, sa)).toBe(true);
  });

  it("Sirius B (white dwarf) at 1 AU → no mesh (too small)", () => {
    // Sirius B ~0.01 R_sun → 0.0465 wu. Distance 1 AU = 1000 wu.
    // sa = 0.0465 / 1000 = 4.65e-5 → below EXIT → no spawn.
    const sa = computeStellarSolidAngle(0.0465, 1000);
    expect(sa).toBeLessThan(STELLAR_MESH_EXIT_RAD);
    expect(shouldStellarMeshBeActive(false, sa)).toBe(false);
  });
});
