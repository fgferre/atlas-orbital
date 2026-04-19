import { useEffect, useState, type ReactNode } from "react";

interface AccordionProps {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export const Accordion = ({
  label,
  defaultOpen = true,
  children,
}: AccordionProps) => {
  const [open, setOpen] = useState(defaultOpen);

  // Re-sync with defaultOpen when it changes (e.g., viewport flips
  // between mobile and desktop mid-session). Menu structure v3.1 §4.3
  // treats "desktop all-open / mobile all-collapsed" as a hard UX
  // contract — breakpoint change re-applies it even if the panel is
  // already mounted. Manual toggles during a stable breakpoint remain
  // sticky because the effect only fires on defaultOpen changes.
  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <div
      className="border border-white/5 bg-black/10"
      data-testid={`accordion-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 border-b border-transparent px-3 py-2.5 text-left transition-[border-color,color] hover:border-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation"
      >
        <span className="text-[10px] font-orbitron uppercase tracking-[0.22em] text-nasa-accent">
          {label}
        </span>
        <span
          aria-hidden="true"
          className={`text-[10px] text-nasa-accent/70 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        >
          ▸
        </span>
      </button>
      {open && <div className="space-y-3 px-3 pb-3 pt-3">{children}</div>}
    </div>
  );
};
