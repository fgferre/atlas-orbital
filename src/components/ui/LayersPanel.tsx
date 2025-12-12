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
  const debugMode = useStore((state) => state.debugMode);
  const toggleDebugMode = useStore((state) => state.toggleDebugMode);
  const useNASAStarfield = useStore((state) => state.useNASAStarfield);
  const toggleStarfieldImplementation = useStore(
    (state) => state.toggleStarfieldImplementation
  );
  const reopenTutorial = useStore((state) => state.reopenTutorial);
  const toggleCredits = useStore((state) => state.toggleCredits);

  return (
    <div
      className={`relative tech-panel tech-transition z-40 flex flex-col pointer-events-auto ${
        isCollapsed ? "w-12 h-12" : "w-64 p-4"
      }`}
      data-tutorial-target="settings"
      style={{
        overflow: isCollapsed ? "hidden" : "visible",
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        title="Settings • Ctrl+Shift+T to replay tutorial"
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
            <div className="flex bg-black/40 p-1 border border-white/10">
              <button
                onClick={() => scaleMode !== "didactic" && toggleScaleMode()}
                className={`flex-1 py-1 text-[10px] font-bold uppercase transition-all ${
                  scaleMode === "didactic"
                    ? "bg-nasa-accent text-black shadow-[0_0_5px_rgba(0,240,255,0.3)]"
                    : "text-gray-500 hover:text-white"
                }`}
              >
                Didactic
              </button>
              <button
                onClick={() => scaleMode !== "realistic" && toggleScaleMode()}
                className={`flex-1 py-1 text-[10px] font-bold uppercase transition-all ${
                  scaleMode === "realistic"
                    ? "bg-nasa-accent text-black shadow-[0_0_5px_rgba(0,240,255,0.3)]"
                    : "text-gray-500 hover:text-white"
                }`}
              >
                Realistic
              </button>
            </div>
          </div>

          {/* Replay Tutorial - Positioned early for discoverability */}
          <div className="border-t border-white/10 pt-3">
            <button
              onClick={reopenTutorial}
              className="w-full py-2 text-[10px] font-orbitron text-nasa-dim border border-white/10 hover:border-nasa-accent hover:text-nasa-accent transition-colors uppercase tracking-widest"
            >
              Replay Tutorial
            </button>
            <div className="text-[9px] text-gray-500 font-mono text-center mt-1">
              Ctrl + Shift + T
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
            {showStarfield && (
              <div className="mt-2 pt-2 border-t border-white/5">
                <div className="text-[10px] text-nasa-dim uppercase tracking-widest mb-2 font-rajdhani">
                  Starfield Source
                </div>
                <div className="flex bg-black/40 p-1 border border-white/10">
                  <button
                    onClick={() =>
                      useNASAStarfield && toggleStarfieldImplementation()
                    }
                    title="Tycho-2: ~2M estrelas próximas com dados de paralaxe. Ideal para visualização precisa do sistema solar local."
                    className={`flex-1 py-1 text-[10px] font-bold uppercase transition-all ${
                      !useNASAStarfield
                        ? "bg-nasa-accent text-black"
                        : "text-gray-500 hover:text-white"
                    }`}
                  >
                    Tycho-2
                  </button>
                  <button
                    onClick={() =>
                      !useNASAStarfield && toggleStarfieldImplementation()
                    }
                    title="NASA Eyes: Catálogo completo incluindo galáxias distantes e objetos do espaço profundo. Dados oficiais da NASA."
                    className={`flex-1 py-1 text-[10px] font-bold uppercase transition-all ${
                      useNASAStarfield
                        ? "bg-nasa-accent text-black"
                        : "text-gray-500 hover:text-white"
                    }`}
                  >
                    NASA Eyes
                  </button>
                </div>
              </div>
            )}
            <div className="pt-2 border-t border-white/10">
              <Toggle
                label="Debug Menu"
                checked={debugMode}
                onChange={toggleDebugMode}
              />
              <div className="text-[9px] text-gray-500 font-mono text-right mt-1">
                Ctrl + Shift + D
              </div>
            </div>
          </div>

          {/* Categories */}
          <div className="border-t border-white/10 pt-4">
            <div className="text-[10px] text-nasa-dim uppercase tracking-widest mb-3 font-rajdhani">
              Visibility
            </div>
            <div className="grid grid-cols-3 gap-1.5">
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

          {/* Project */}
          <div className="border-t border-white/10 pt-4">
            <div className="text-[10px] text-nasa-dim uppercase tracking-widest mb-3 font-rajdhani">
              System Info
            </div>
            <button
              onClick={toggleCredits}
              className="w-full py-2 text-[10px] font-orbitron text-nasa-dim border border-white/10 hover:border-nasa-accent hover:text-nasa-accent transition-colors uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <span>Mission Report</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
            <div className="text-[9px] text-gray-600 font-mono text-center mt-2">
              v0.1.0 • Atlas Orbital
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
      className={`w-7 h-4 relative transition-colors border ${
        checked
          ? "bg-nasa-accent/20 border-nasa-accent/50"
          : "bg-gray-800 border-gray-700"
      }`}
    >
      <div
        className={`absolute top-0.5 w-2.5 h-2.5 transition-all ${
          checked ? "left-3.5 bg-nasa-accent" : "left-0.5 bg-gray-500"
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
    className={`px-1.5 py-1 text-[9px] uppercase border transition-all ${
      checked
        ? "border-nasa-accent text-nasa-accent bg-nasa-accent/10"
        : "border-gray-700 text-gray-600 hover:border-gray-500"
    }`}
  >
    {label}
  </button>
);
