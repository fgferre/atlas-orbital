import { useEffect } from "react";
import { useStore } from "../../store";

export const TopBar = () => {
  const focusHome = useStore((state) => state.focusHome);
  const focusBack = useStore((state) => state.focusBack);
  const canFocusBack = useStore((state) => state.focusHistory.length > 0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTyping) return;

      if (e.key.toLowerCase() === "h") {
        e.preventDefault();
        focusHome();
      }

      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        focusBack();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusBack, focusHome]);

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

      {/* Right Controls */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <button
          onClick={focusBack}
          disabled={!canFocusBack}
          title="Back (Alt + \u2190)"
          className="w-10 h-10 flex items-center justify-center text-nasa-accent hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-nasa-accent"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M10 19l-7-7 7-7v4h10a1 1 0 011 1v4a1 1 0 01-1 1H10v4z" />
          </svg>
        </button>
        <button
          onClick={focusHome}
          title="Home (H)"
          className="w-10 h-10 flex items-center justify-center text-nasa-accent hover:text-white transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 3l9 8h-3v10H6V11H3l9-8z" />
          </svg>
        </button>
      </div>

      {/* Decorative Line */}
      <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-nasa-accent/30 to-transparent"></div>
    </div>
  );
};
