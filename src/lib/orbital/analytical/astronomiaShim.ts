/**
 * Typed shim for the untyped `astronomia` npm package.
 *
 * `astronomia` ships as pure JavaScript with JSDoc only, which TypeScript's
 * `bundler` module resolution cannot project into usable types (the `exports`
 * field resolves to `.js` files with no adjacent `.d.ts`, so any ambient
 * `declare module` entry is ignored). Funnelling every untyped import through
 * this single module keeps the rest of the analytical code strictly typed.
 *
 * Only the surface Atlas actually consumes is re-exported. Types are derived
 * from the upstream JSDoc (`node_modules/astronomia/src/*.js`) and kept
 * minimal on purpose.
 */

/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore -- astronomia ships no type declarations
import planetposition from "astronomia/planetposition";
// @ts-ignore -- astronomia ships no type declarations
import plutoModule from "astronomia/pluto";
// @ts-ignore -- astronomia ships no type declarations
import elpModule from "astronomia/elp";
// @ts-ignore -- data module, no types
import _vsop87Dmercury from "astronomia/data/vsop87Dmercury";
// @ts-ignore -- data module, no types
import _vsop87Dvenus from "astronomia/data/vsop87Dvenus";
// @ts-ignore -- data module, no types
import _vsop87Dearth from "astronomia/data/vsop87Dearth";
// @ts-ignore -- data module, no types
import _vsop87Dmars from "astronomia/data/vsop87Dmars";
// @ts-ignore -- data module, no types
import _vsop87Djupiter from "astronomia/data/vsop87Djupiter";
// @ts-ignore -- data module, no types
import _vsop87Dsaturn from "astronomia/data/vsop87Dsaturn";
// @ts-ignore -- data module, no types
import _vsop87Duranus from "astronomia/data/vsop87Duranus";
// @ts-ignore -- data module, no types
import _vsop87Dneptune from "astronomia/data/vsop87Dneptune";
// @ts-ignore -- data module, no types
import _elpMppDe from "astronomia/data/elpMppDe";
/* eslint-enable @typescript-eslint/ban-ts-comment */

export interface Vsop87Series {
  name: string;
  type?: "B" | "D";
  L: Record<string, number[][]>;
  B: Record<string, number[][]>;
  R: Record<string, number[][]>;
}

export interface Coord3 {
  /** heliocentric longitude in radians */
  lon: number;
  /** heliocentric latitude in radians */
  lat: number;
  /** heliocentric range in AU */
  range: number;
  ra?: number;
  dec?: number;
}

export interface PlanetInstance {
  name: string;
  type: "B" | "D";
  position2000(jde: number): Coord3;
  position(jde: number): Coord3;
}

export interface PlanetCtor {
  new (data: Vsop87Series): PlanetInstance;
}

export const Planet = (planetposition as { Planet: PlanetCtor }).Planet;

export interface PlutoHeliocentric {
  lon: number;
  lat: number;
  range: number;
}

export const pluto = plutoModule as {
  heliocentric: (jde: number) => PlutoHeliocentric;
};

export interface ElpSeries {
  W1: number[];
  L: Record<string, number[][]>;
  B: Record<string, number[][]>;
  R: Record<string, number[][]>;
}

export interface MoonCtor {
  new (data: ElpSeries): {
    positionXYZ(jde: number): { x: number; y: number; z: number };
    position(jde: number): { lon: number; lat: number; range: number };
    lightTime(jde: number): number;
  };
}

export const elp = elpModule as { Moon: MoonCtor };

export const vsop87Dmercury = _vsop87Dmercury as Vsop87Series;
export const vsop87Dvenus = _vsop87Dvenus as Vsop87Series;
export const vsop87Dearth = _vsop87Dearth as Vsop87Series;
export const vsop87Dmars = _vsop87Dmars as Vsop87Series;
export const vsop87Djupiter = _vsop87Djupiter as Vsop87Series;
export const vsop87Dsaturn = _vsop87Dsaturn as Vsop87Series;
export const vsop87Duranus = _vsop87Duranus as Vsop87Series;
export const vsop87Dneptune = _vsop87Dneptune as Vsop87Series;
export const elpMppDe = _elpMppDe as ElpSeries;
