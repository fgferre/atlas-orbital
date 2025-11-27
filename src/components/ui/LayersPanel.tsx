import { useState } from "react";
import { useStore } from "../../store";

export const LayersPanel = () => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const showLabels = useStore((state) => state.showLabels);
  const toggleLabels = useStore((state) => state.toggleLabels);
  const showIcons = useStore((state) => state.showIcons);
  const toggleIcons = useStore((state) => state.toggleIcons);
  const showOrbits = useStore((state) => state.showOrbits);
  const toggleOrbits = useStore((state) => state.toggleOrbits);
  const scaleMode = useStore((state) => state.scaleMode);
  const toggleScaleMode = useStore((state) => state.toggleScaleMode);
  const showStarfield = useStore((state) => state.showStarfield);
  const toggleShowStarfield = useStore((state) => state.toggleShowStarfield);
  const visibility = useStore((state) => state.visibility);
  const toggleVisibility = useStore((state) => state.toggleVisibility);

  return (
    <div
      className={`absolute top-20 right-4 glass-panel transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) z-40 flex flex-col pointer-events-auto ${
        isCollapsed ? "w-12 h-12 rounded-lg" : "w-64 p-4 rounded-lg"
      }`}
      style={{ overflow: isCollapsed ? "hidden" : "visible" }}
    >
      {/* Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={`absolute top-0 right-0 w-12 h-12 flex items-center justify-center text-nasa-accent hover:text-white transition-colors z-50 ${
          isCollapsed ? "bg-transparent" : "bg-white/5"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-6 w-6 transition-transform duration-500 ${!isCollapsed ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {!isCollapsed && (
        <div className="animate-fade-in space-y-6 mt-2">
          <div className="text-xs text-nasa-accent font-orbitron tracking-widest uppercase border-b border-nasa-accent/30 pb-2">
            Data Control
          </div>

          {/* Scale Mode */}
          <div>
            <div className="text-[10px] text-nasa-dim uppercase tracking-widest mb-2 font-rajdhani">
              Scale Mode
            </div>
            <div className="flex bg-black/40 rounded p-1 border border-white/10">
              <button
                onClick={() => scaleMode !== "didactic" && toggleScaleMode()}
                className={`flex-1 py-1 text-[10px] font-bold uppercase transition-all rounded ${
                  scaleMode === "didactic"
                    ? "bg-nasa-accent text-black shadow-[0_0_10px_rgba(0,240,255,0.5)]"
                    : "text-gray-500 hover:text-white"
                }`}
              >
                Didactic
              </button>
              <button
                onClick={() => scaleMode !== "realistic" && toggleScaleMode()}
                className={`flex-1 py-1 text-[10px] font-bold uppercase transition-all rounded ${
                  scaleMode === "realistic"
                    ? "bg-nasa-accent text-black shadow-[0_0_10px_rgba(0,240,255,0.5)]"
                    : "text-gray-500 hover:text-white"
                }`}
              >
                Realistic
              </button>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <Toggle label="Icons" checked={showIcons} onChange={toggleIcons} />
            <Toggle
              label="Labels"
              checked={showLabels}
              onChange={toggleLabels}
            />
            <Toggle
              label="Orbits"
              checked={showOrbits}
              onChange={toggleOrbits}
            />
            <Toggle
              label="Starfield"
              checked={showStarfield}
              onChange={toggleShowStarfield}
            />
          </div>

          {/* Categories */}
          <div className="border-t border-white/10 pt-4">
            <div className="text-[10px] text-nasa-dim uppercase tracking-widest mb-3 font-rajdhani">
              Visibility
            </div>
            <div className="grid grid-cols-2 gap-2">
              <CategoryToggle
                label="Planets"
                checked={visibility.planets}
                onChange={() => toggleVisibility("planets")}
              />
              <CategoryToggle
                label="Moons"
                checked={visibility.moons}
                onChange={() => toggleVisibility("moons")}
              />
              <CategoryToggle
                label="Dwarfs"
                checked={visibility.dwarfs}
                onChange={() => toggleVisibility("dwarfs")}
              />
              <CategoryToggle
                label="Asteroids"
                checked={visibility.asteroids}
                onChange={() => toggleVisibility("asteroids")}
              />
              <CategoryToggle
                label="TNOs"
                checked={visibility.tnos}
                onChange={() => toggleVisibility("tnos")}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Toggle = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) => (
  <div
    className="flex items-center justify-between cursor-pointer group"
    onClick={onChange}
  >
    <span className="text-xs text-gray-300 group-hover:text-white font-rajdhani transition-colors">
      {label}
    </span>
    <div
      className={`w-8 h-4 rounded-full relative transition-colors ${checked ? "bg-nasa-accent/20" : "bg-gray-800"}`}
    >
      <div
        className={`absolute top-0.5 w-3 h-3 rounded-full transition-all shadow-sm ${
          checked
            ? "left-4.5 bg-nasa-accent shadow-[0_0_5px_#00f0ff]"
            : "left-0.5 bg-gray-500"
        }`}
      ></div>
    </div>
  </div>
);

const CategoryToggle = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) => (
  <button
    onClick={onChange}
    className={`px-2 py-1 text-[10px] uppercase border rounded transition-all ${
      checked
        ? "border-nasa-accent text-nasa-accent bg-nasa-accent/10"
        : "border-gray-700 text-gray-600 hover:border-gray-500"
    }`}
  >
    {label}
  </button>
);
