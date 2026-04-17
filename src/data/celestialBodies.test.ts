import { describe, expect, it } from "vitest";
import { SOLAR_SYSTEM_BODIES } from "./celestialBodies";

const getBody = (id: string) => {
  const body = SOLAR_SYSTEM_BODIES.find((candidate) => candidate.id === id);
  expect(body).toBeDefined();
  return body!;
};

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
