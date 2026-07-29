import { useStore } from "../../store";
import { Starfield } from "./Starfield";
import { StarHoverPicker } from "./StarHoverPicker";

export const StarfieldManager = () => {
  const showStarfield = useStore((state) => state.showStarfield);

  if (!showStarfield) {
    return null;
  }

  return (
    <>
      <Starfield />
      <StarHoverPicker />
    </>
  );
};
