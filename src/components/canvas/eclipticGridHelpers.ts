import { AstroPhysics, type ScaleMode } from "../../lib/astrophysics";

type GridTickDefinition = {
  au: number;
  distance: number;
};

export const ECLIPTIC_GRID_TICKS_AU = [1, 2, 5, 10, 20, 30, 40] as const;
export const ECLIPTIC_GRID_LINEAR_UNITS_PER_AU = 1000;

export const resolveEclipticGridWorldDistance = (
  au: number,
  scaleMode: ScaleMode
) =>
  scaleMode === "didactic"
    ? AstroPhysics.mapDidacticHeliocentricDistance(au)
    : au * ECLIPTIC_GRID_LINEAR_UNITS_PER_AU;

export const resolveEclipticGridTickDefinitions = (
  scaleMode: ScaleMode
): GridTickDefinition[] =>
  ECLIPTIC_GRID_TICKS_AU.map((au) => ({
    au,
    distance: resolveEclipticGridWorldDistance(au, scaleMode),
  }));
