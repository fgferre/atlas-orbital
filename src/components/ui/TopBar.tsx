import { useEffect, type ReactNode } from "react";
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
    <div className="pointer-events-none absolute left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-30">
      <div className="command-shell tech-corners ghost-border pointer-events-auto flex items-center gap-2 px-2.5 py-2 sm:px-3">
        <div className="flex min-w-[9rem] items-center gap-2 border border-white/8 bg-black/15 px-2.5 py-2 sm:min-w-[10rem]">
          <div className="flex h-6 w-6 items-center justify-center border border-nasa-accent/35 bg-nasa-accent/10 shadow-[0_0_12px_rgba(0,240,255,0.12)]">
            <div className="h-1.5 w-1.5 bg-nasa-accent shadow-[0_0_8px_rgba(0,240,255,0.45)]"></div>
          </div>
          <div className="min-w-0">
            <h1 className="text-[10px] font-bold tracking-[0.2em] text-white sm:text-[11px]">
              <span className="font-orbitron">ATLAS </span>
              <span className="font-orbitron text-nasa-accent">ORBITAL</span>
            </h1>
            <div className="mt-0.5 text-[8px] font-orbitron uppercase tracking-[0.18em] text-nasa-accent/80">
              System Online
            </div>
          </div>
        </div>

        <div className="flex items-stretch gap-1.5">
          <TopBarButton
            label="Back"
            title="Back (Alt + ←)"
            ariaLabel="Return to the previous focused body"
            disabled={!canFocusBack}
            onClick={focusBack}
          >
            <path d="M10 19l-7-7 7-7v4h10a1 1 0 011 1v4a1 1 0 01-1 1H10v4z" />
          </TopBarButton>
          <TopBarButton
            label="Home"
            title="Home (H)"
            ariaLabel="Focus the Sun and reset the sidebar selection"
            onClick={focusHome}
          >
            <path d="M12 3l9 8h-3v10H6V11H3l9-8z" />
          </TopBarButton>
        </div>
      </div>
    </div>
  );
};

const TopBarButton = ({
  label,
  title,
  ariaLabel,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  title: string;
  ariaLabel: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={ariaLabel}
    className="flex min-w-[3.6rem] flex-col items-center justify-center gap-1 border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[8px] font-orbitron uppercase tracking-[0.16em] text-nasa-accent transition-[border-color,color,background-color,box-shadow] hover:border-nasa-accent/40 hover:bg-nasa-accent/8 hover:text-white hover:shadow-[0_0_12px_rgba(0,240,255,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:text-nasa-accent touch-manipulation sm:min-w-[4rem]"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      {children}
    </svg>
    <span>{label}</span>
  </button>
);
