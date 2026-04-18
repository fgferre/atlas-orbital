import { memo } from "react";
import { useStore } from "../../store";

// This component renders OUTSIDE the Canvas and displays HTML overlays.
// Wrapped in `memo` because `overlayItems` is re-emitted only when its
// pixel-quantized fingerprint changes (see
// `OverlayPositionTracker.tsx`), so React can skip the whole subtree
// unless one of our props changed by reference.
export const PlanetOverlay = memo(() => {
  // Select each slice individually (as opposed to the `useStore()`
  // no-argument form, which would subscribe this component to every
  // store mutation — focus changes, hover, tutorial steps, datetime
  // ticks, anything). Focused selectors keep this component quiet
  // unless the overlay array or the two visibility toggles change.
  const overlayItems = useStore((state) => state.overlayItems);
  const showLabels = useStore((state) => state.showLabels);
  const showIcons = useStore((state) => state.showIcons);
  const selectId = useStore((state) => state.selectId);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {overlayItems.map((item) => (
        <div key={item.id}>
          {/* Planet Icon — real <button> for keyboard activation + screen readers. */}
          {showIcons && item.showIcon && (
            <button
              type="button"
              aria-label={`Focus ${item.name}`}
              className="absolute w-3 h-3 border border-white/40 rounded-full pointer-events-auto cursor-pointer hover:border-nasa-accent hover:scale-110 hover:bg-nasa-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent bg-transparent p-0"
              style={{
                left: `${item.x}px`,
                top: `${item.y}px`,
                transform: "translate(-50%, -50%)",
                transition: "border-color 0.2s, scale 0.2s",
              }}
              onClick={(e) => {
                e.stopPropagation();
                selectId(item.id);
              }}
            />
          )}

          {/* Planet Label — also a button for mouse users, but skipped
              from the Tab order when the icon is present (which is
              always, per OverlayPositionTracker's collision rules —
              label implies icon). This avoids two tab stops + two
              identical "Focus <name>" announcements per body for
              keyboard + screen-reader users. The visible text already
              provides the accessible name, so we drop the redundant
              `aria-label`. */}
          {showLabels && item.showLabel && (
            <button
              type="button"
              tabIndex={showIcons && item.showIcon ? -1 : 0}
              className="absolute text-gray-300 text-xs font-semibold uppercase tracking-wide pointer-events-auto cursor-pointer transition-colors hover:text-nasa-accent drop-shadow-md whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent bg-transparent border-0 p-0"
              style={{
                left: `${item.x}px`,
                top: `${item.y}px`,
                transform: "translate(12px, -50%)",
                textShadow: "0 1px 4px rgba(0,0,0,1)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                selectId(item.id);
              }}
            >
              {item.name}
            </button>
          )}
        </div>
      ))}
    </div>
  );
});

PlanetOverlay.displayName = "PlanetOverlay";
