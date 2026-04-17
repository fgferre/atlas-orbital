import { useStore } from "../../store";
import { NASAStarfield } from "./NASAStarfield";
import { Starfield } from "./Starfield";
import { StarHoverPicker } from "./StarHoverPicker";

export const StarfieldManager = () => {
  const showStarfield = useStore((state) => state.showStarfield);
  const starfieldSource = useStore((state) => state.starfieldSource);

  if (!showStarfield) {
    return null;
  }

  // `hyg` is the default preset and gets hover-picker support. `nasa`
  // remains the visual-comparison reference and stays as-is.
  if (starfieldSource === "nasa") {
    return <NASAStarfield />;
  }
  return (
    <>
      <Starfield />
      <StarHoverPicker />
    </>
  );
};
