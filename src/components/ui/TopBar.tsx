// import { SearchBar } from "./SearchBar"; // Moved to Overlay

export const TopBar = () => {
  return (
    <div className="absolute top-0 left-0 w-full h-16 flex items-center justify-between px-6 z-20 pointer-events-none">
      {/* Logo Area */}
      <div className="flex items-center gap-4 pointer-events-auto">
        <div className="w-8 h-8 border-2 border-nasa-accent rounded-full flex items-center justify-center animate-pulse">
          <div className="w-2 h-2 bg-nasa-accent rounded-full"></div>
        </div>
        <div>
          <h1 className="text-2xl font-bold font-orbitron tracking-widest text-white">
            ATLAS <span className="text-nasa-accent">ORBITAL</span>
          </h1>
          <div className="text-[10px] text-nasa-dim uppercase tracking-[0.2em] font-rajdhani">
            System Online
          </div>
        </div>
      </div>

      {/* Center Search - REMOVED */}
      {/* <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto">
        <SearchBar />
      </div> */}

      {/* Right Controls */}
      <div className="flex items-center gap-6 pointer-events-auto">
        {/* Future controls */}
      </div>

      {/* Decorative Line */}
      <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-nasa-accent/30 to-transparent"></div>
    </div>
  );
};
