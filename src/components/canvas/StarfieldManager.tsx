import { useStore } from "../../store";
import { NASAStarfield } from "./NASAStarfield";
import { Starfield } from "./Starfield";

export const StarfieldManager = () => {
  const showStarfield = useStore((state) => state.showStarfield);
  const starfieldSource = useStore((state) => state.starfieldSource);

  if (!showStarfield) {
    return null;
  }

  return starfieldSource === "nasa" ? <NASAStarfield /> : <Starfield />;
  // `hyg` falls through to the HYG-backed <Starfield />; future presets
  // (if they appear) should add their own cases explicitly.
};
