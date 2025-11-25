import { useStore } from "../../store";

// This component renders OUTSIDE the Canvas and displays HTML overlays
export const PlanetOverlay = () => {
  const { overlayItems, showLabels, showIcons, selectId } = useStore();

  return (
    <div className="absolute inset-0 pointer-events-none">
      {overlayItems.map((item) => (
        <div key={item.id}>
          {/* Planet Icon */}
          {showIcons && item.showIcon && (
            <div
              className="absolute w-3 h-3 border border-white/40 rounded-full pointer-events-auto cursor-pointer hover:border-nasa-accent hover:scale-110 hover:bg-nasa-accent/10"
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

          {/* Planet Label */}
          {showLabels && item.showLabel && (
            <div
              className="absolute text-gray-300 text-xs font-semibold uppercase tracking-wide pointer-events-auto cursor-pointer transition-colors hover:text-nasa-accent drop-shadow-md whitespace-nowrap"
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
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
