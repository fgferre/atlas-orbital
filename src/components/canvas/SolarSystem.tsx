import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { useMemo } from "react";
import { Planet } from "./Planet";
import { useStore } from "../../store";

interface SolarSystemProps {
  roughness: number;
  metalness: number;
  sunEmissive: number;
  ringEmissive: number;
  ringShadowIntensity: number;
  earthRotationOffset: number;
  nightLightIntensity: number;
}

export const SolarSystem = ({
  roughness,
  metalness,
  sunEmissive,
  ringEmissive,
  ringShadowIntensity,
  earthRotationOffset,
  nightLightIntensity,
}: SolarSystemProps) => {
  const visibility = useStore((state) => state.visibility);

  // Group bodies by parentId
  const bodiesByParent = useMemo(() => {
    return SOLAR_SYSTEM_BODIES.reduce(
      (acc, body) => {
        const pid = body.parentId || "root";
        if (!acc[pid]) acc[pid] = [];
        acc[pid].push(body);
        return acc;
      },
      {} as Record<string, typeof SOLAR_SYSTEM_BODIES>
    );
  }, []);

  const renderBody = (id: string) => {
    const bodies = bodiesByParent[id];
    if (!bodies) return null;

    return bodies.map((body) => {
      // Check visibility based on body type
      let isVisible = true;
      if (body.type === "planet") isVisible = visibility.planets;
      else if (body.type === "dwarf") isVisible = visibility.dwarfs;
      else if (body.type === "moon") isVisible = visibility.moons;
      else if (body.type === "asteroid") isVisible = visibility.asteroids;
      else if (body.type === "comet") isVisible = visibility.comets;
      else if (body.type === "tno") isVisible = visibility.tnos;

      // Always show the Sun (star)
      if (body.type === "star") isVisible = true;

      if (!isVisible) return null;

      return (
        <Planet
          key={body.id}
          body={body}
          roughness={roughness}
          metalness={metalness}
          sunEmissive={sunEmissive}
          ringEmissive={ringEmissive}
          ringShadowIntensity={ringShadowIntensity}
          earthRotationOffset={earthRotationOffset}
          nightLightIntensity={nightLightIntensity}
        >
          {renderBody(body.id)}
        </Planet>
      );
    });
  };

  return <group>{renderBody("root")}</group>;
};
