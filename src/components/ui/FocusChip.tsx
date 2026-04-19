import { BODIES_BY_ID } from "../../data/celestialBodies";
import { useStore } from "../../store";

/**
 * FocusChip — conditional breadcrumb in the TopBar for users who
 * closed the Sidebar without deselecting the camera focus.
 *
 * Menu structure v3.1 §5.1 contract:
 * - Visibility: `selectedId === null && focusId !== null` (Sidebar
 *   closed, camera still focused).
 * - Content: derived from `focusId` — never mirrors Sidebar state.
 * - Click: re-opens the Sidebar without polluting `focusHistory`.
 *
 * The click uses `setSelectedId(focusId)` rather than `selectId(focusId)`.
 * `selectId` mutates `focusHistory` (for Alt+← navigation); re-surfacing
 * the panel for a body that is already focused is not a new navigation
 * event and must not enter the history stack (Codex PR 2 review).
 */
export const FocusChip = () => {
  const selectedId = useStore((s) => s.selectedId);
  const focusId = useStore((s) => s.focusId);
  const setSelectedId = useStore((s) => s.setSelectedId);

  if (selectedId !== null || focusId === null) return null;

  const body = BODIES_BY_ID.get(focusId);
  if (!body) return null;

  const classification = body.classification ?? body.type.toUpperCase();
  const handleClick = () => setSelectedId(focusId);

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid="focus-chip"
      aria-label={`Re-open details for ${body.name.en}`}
      title={`Focused: ${body.name.en} (${classification}). Click to reopen the info panel.`}
      className="flex items-center gap-1.5 border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[9px] font-orbitron uppercase tracking-[0.16em] text-white transition-[border-color,color,background-color] hover:border-nasa-accent/50 hover:text-nasa-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation"
    >
      <span>{body.name.en}</span>
      <span className="border-l border-white/15 pl-1.5 text-[8px] text-white/55">
        {classification}
      </span>
    </button>
  );
};
