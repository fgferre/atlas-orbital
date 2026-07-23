import { describe, expect, it } from "vitest";
import { SOLAR_SYSTEM_BODIES } from "./celestialBodies";
import { getVisualAssetByBodyPath } from "./assetManifest";
import { AstroPhysics, type CelestialBody } from "../lib/astrophysics";
import { getOrbitalMetadata } from "../lib/orbital/registry";

const getBody = (id: string) => {
  const body = SOLAR_SYSTEM_BODIES.find((candidate) => candidate.id === id);
  expect(body).toBeDefined();
  return body!;
};

/** CODATA 2018 gravitational constant (m³ kg⁻¹ s⁻²). */
const GRAVITATIONAL_CONSTANT = 6.6743e-11;
const SECONDS_PER_DAY = 86400;
const AU_IN_METERS = 149597870700;

/** Every catalog body as an `it.each` case — never a literal id list. */
const CATALOG_CASES = SOLAR_SYSTEM_BODIES.map(
  (body): [string, CelestialBody] => [body.id, body]
);

const parse = (value?: string) => AstroPhysics.parseScientificValue(value);

const surfaceGravityFromMass = (body: CelestialBody) => {
  const mass = parse(body.mass);
  const radiusM = body.radiusKm * 1000;
  return (GRAVITATIONAL_CONSTANT * mass) / (radiusM * radiusM);
};

/** Mean density in g/cm³ from the catalog mass + mean radius. */
const bulkDensityGramsPerCm3 = (body: CelestialBody) => {
  const mass = parse(body.mass);
  const radiusM = body.radiusKm * 1000;
  const volumeM3 = (4 / 3) * Math.PI * radiusM ** 3;
  return mass / volumeM3 / 1000;
};

/**
 * Bodies whose catalog `gravity` legitimately deviates from the
 * spherical `GM/R²` identity. Every entry is a real physical effect
 * (equatorial bulge from fast rotation, or a strongly non-spherical
 * shape whose mean radius is not the surface radius), NOT a data bug.
 * Audited 2026-07-23 — do not extend without re-measuring.
 */
const GRAVITY_IDENTITY_ALLOWLIST: Record<string, string> = {
  // Rotational flattening: published `gravity` is the equatorial (1-bar)
  // value, which sits further from the centre than the mean radius.
  saturn: "equatorial 1-bar gravity vs mean radius (flattening 0.098)",
  jupiter: "equatorial 1-bar gravity vs mean radius (flattening 0.065)",
  haumea: "extreme rotational elongation (Jacobi ellipsoid, 3.9 h spin)",
  // Irregular shapes: `radiusKm` is a volume-equivalent mean radius, so
  // the published surface gravity is not GM/R̄².
  deimos: "irregular 15×12×11 km body; published g is surface-averaged",
  pallas: "irregular tri-axial asteroid; published g is surface-averaged",
};

const GRAVITY_IDENTITY_TOLERANCE = 0.05;

/**
 * Kepler-routed bodies whose catalog mean motion cannot be reconciled
 * with the two-body period at better than 10% right now. Empty is the
 * goal — anything listed here is an open data gap, not a pass.
 */
const KNOWN_GAPS: Record<string, string> = {};

describe("catalog physical self-consistency", () => {
  it.each(CATALOG_CASES)(
    "%s keeps gravity consistent with GM/R²",
    (id, body) => {
      const mass = parse(body.mass);
      const gravity = parse(body.gravity);
      if (!Number.isFinite(mass) || !Number.isFinite(gravity)) return;

      const expected = surfaceGravityFromMass(body);
      const error = Math.abs(gravity - expected) / expected;

      if (GRAVITY_IDENTITY_ALLOWLIST[id]) {
        // Allowlisted bodies still must not drift wildly.
        expect(error, GRAVITY_IDENTITY_ALLOWLIST[id]).toBeLessThan(0.15);
        return;
      }

      expect(
        error,
        `${id}: gravity ${gravity} vs GM/R² ${expected.toFixed(4)}`
      ).toBeLessThan(GRAVITY_IDENTITY_TOLERANCE);
    }
  );

  it.each(CATALOG_CASES)("%s has a physically possible density", (id, body) => {
    const mass = parse(body.mass);
    if (!Number.isFinite(mass)) return;

    const density = bulkDensityGramsPerCm3(body);

    // Floor: Saturn (0.687) is the least dense Solar System body.
    // Ceiling: Earth (5.513) is the densest.
    expect(density, `${id}: ${density.toFixed(3)} g/cm³`).toBeGreaterThan(0.3);
    expect(density, `${id}: ${density.toFixed(3)} g/cm³`).toBeLessThan(5.6);
  });

  it.each(CATALOG_CASES)("%s has a non-zero rotation period", (_id, body) => {
    // `Planet.tsx` gates rotation on the falsy check
    // `if (body.rotationPeriodHours)`, so a literal 0 silently freezes
    // the body instead of meaning "unknown".
    expect(body.rotationPeriodHours).not.toBe(0);
    expect(Number.isFinite(body.rotationPeriodHours)).toBe(true);
  });

  it.each(CATALOG_CASES)(
    "%s has no ASCII digit glued to a superscript exponent",
    (_id, body) => {
      const brokenExponent = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺][0-9]/;
      expect(body.mass ?? "").not.toMatch(brokenExponent);
      expect(body.gravity ?? "").not.toMatch(brokenExponent);
    }
  );
});

describe("Kepler-routed mean motion matches two-body period", () => {
  const keplerCases = CATALOG_CASES.filter(
    ([id]) => getOrbitalMetadata(id)?.primaryModel === "Kepler"
  );

  it.each(keplerCases)("%s", (id, body) => {
    const parent = getBody(body.parentId ?? "sun");
    const centralMass = parse(parent.mass);
    const orbitedMass = parse(body.mass);
    const totalMass =
      centralMass + (Number.isFinite(orbitedMass) ? orbitedMass : 0);

    const semiMajorM = body.orbit.a * AU_IN_METERS;
    const periodDays =
      (2 *
        Math.PI *
        Math.sqrt(semiMajorM ** 3 / (GRAVITATIONAL_CONSTANT * totalMass))) /
      SECONDS_PER_DAY;

    const catalogPeriodDays = 360 / body.orbit.n;
    const error = Math.abs(catalogPeriodDays - periodDays) / periodDays;

    if (KNOWN_GAPS[id]) {
      expect(error, KNOWN_GAPS[id]).toBeLessThan(1);
      return;
    }

    expect(
      error,
      `${id}: catalog P ${catalogPeriodDays.toFixed(4)} d vs Kepler P ${periodDays.toFixed(4)} d`
    ).toBeLessThan(0.1);
  });
});

describe("non-measured visual assets declare provenance", () => {
  const NON_MEASURED_ASSET = /fictional|procedural|artist|by_|deviant/i;

  const assetPathsFor = (body: CelestialBody) =>
    [...Object.values(body.textures ?? {}), body.model?.path].filter(
      (path): path is string => typeof path === "string"
    );

  it.each(CATALOG_CASES)(
    "%s labels every non-measured asset it ships",
    (id, body) => {
      const flagged = assetPathsFor(body).filter((path) =>
        NON_MEASURED_ASSET.test(path)
      );
      if (flagged.length === 0) return;

      expect(
        body.visualProvenance,
        `${id} ships ${flagged.join(", ")} without visualProvenance`
      ).toBeDefined();
      expect(body.visualProvenance!.fidelity).not.toBe("measured");
      expect(
        body.visualProvenance!.limitationReason ?? "",
        `${id} needs an explicit limitationReason`
      ).not.toBe("");

      for (const path of flagged) {
        const role = path === body.model?.path ? "model" : "texture";
        expect(
          getVisualAssetByBodyPath(id, path, role),
          `${id}: ${path} is missing a VISUAL_ASSET_MANIFEST entry`
        ).not.toBeNull();
      }
    }
  );
});

describe("minor-body visual provenance", () => {
  it("documents the Phase 3 target bodies in structured provenance fields", () => {
    for (const id of [
      "gonggong",
      "quaoar",
      "orcus",
      "sedna",
      "salacia",
      "vanth",
      "weywot",
      "vesta",
      "pallas",
      "hygiea",
    ]) {
      const body = getBody(id);

      expect(body.visualProvenance?.summary).toBeTruthy();
      expect(body.visualProvenance?.fidelity).toBeTruthy();
    }
  });

  it("keeps interpretive targets free from fake detailed texture maps", () => {
    for (const id of [
      "gonggong",
      "orcus",
      "sedna",
      "salacia",
      "vanth",
      "weywot",
      "pallas",
    ]) {
      expect(getBody(id).textures?.map).toBeUndefined();
    }
  });

  it("wires Earth's PBR channels to the baked SSS normal + roughness maps", () => {
    const earth = getBody("earth");
    expect(earth.textures?.normal).toMatch(/8k_earth_normal_map\.jpg$/);
    expect(earth.textures?.roughness).toMatch(/8k_earth_roughness_map\.jpg$/);
  });

  it("uses observational upgrades where the handoff calls for them", () => {
    expect(getBody("vesta").model?.path).toContain("Vesta_1_100.glb");
    expect(getBody("vesta").textures?.map).toContain("vesta_dawn_embedded");
    expect(getBody("pallas").model?.path).toContain("Pallas_DAMIT_101.obj");
    expect(getBody("hygiea").model?.path).toContain("Hygiea_DAMIT_4392.obj");
    expect(getBody("hygiea").textures?.map).toContain(
      "hygiea_vlt_2017_2018_map"
    );
    expect(getBody("titan").textures?.map).toContain(
      "titan_cassini_iss_global_mosaic_4km"
    );
    expect(getBody("europa").textures?.map).toContain(
      "europa_voyager_galileo_global_mosaic_500m"
    );
    expect(getBody("quaoar").shapeScale).toEqual([1.18, 0.99, 0.86]);
  });
});
