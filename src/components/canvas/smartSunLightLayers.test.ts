import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  bindSmartSunLayer,
  SMART_SUN_LIGHT_LAYER,
} from "./smartSunLightLayers";

const isSmartSunLayerEnabled = (object: THREE.Object3D) =>
  object.layers.isEnabled(SMART_SUN_LIGHT_LAYER);

describe("bindSmartSunLayer", () => {
  it("enables the focused subtree but excludes nested celestial bodies", () => {
    const earth = new THREE.Group();
    earth.name = "earth";
    const earthSurface = new THREE.Mesh();
    const moon = new THREE.Group();
    moon.name = "moon";
    const moonSurface = new THREE.Mesh();
    moon.add(moonSurface);
    earth.add(earthSurface, moon);

    const release = bindSmartSunLayer(earth, "earth");

    expect(isSmartSunLayerEnabled(earth)).toBe(true);
    expect(isSmartSunLayerEnabled(earthSurface)).toBe(true);
    expect(isSmartSunLayerEnabled(moon)).toBe(false);
    expect(isSmartSunLayerEnabled(moonSurface)).toBe(false);

    release();
    expect(isSmartSunLayerEnabled(earth)).toBe(false);
    expect(isSmartSunLayerEnabled(earthSurface)).toBe(false);
  });

  it("updates only newly added or removed loader subtrees", () => {
    const haumea = new THREE.Group();
    haumea.name = "haumea";
    const release = bindSmartSunLayer(haumea, "haumea");

    const loadedModel = new THREE.Group();
    const loadedMesh = new THREE.Mesh();
    loadedModel.add(loadedMesh);
    haumea.add(loadedModel);

    expect(isSmartSunLayerEnabled(loadedModel)).toBe(true);
    expect(isSmartSunLayerEnabled(loadedMesh)).toBe(true);

    haumea.remove(loadedModel);
    expect(isSmartSunLayerEnabled(loadedModel)).toBe(false);
    expect(isSmartSunLayerEnabled(loadedMesh)).toBe(false);

    release();
  });

  it("keeps late descendants of a nested moon outside the focused layer", () => {
    const saturn = new THREE.Group();
    saturn.name = "saturn";
    const titan = new THREE.Group();
    titan.name = "titan";
    saturn.add(titan);

    const release = bindSmartSunLayer(saturn, "saturn");
    const lateTitanModel = new THREE.Mesh();
    titan.add(lateTitanModel);

    expect(isSmartSunLayerEnabled(lateTitanModel)).toBe(false);
    release();
  });
});
