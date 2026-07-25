import { useTranslation } from "react-i18next";

import { BODIES_BY_ID } from "../../data/celestialBodies";
import { parseHygFocusId } from "../../lib/focus/hygFocusResolver";
import { resolveBodyName } from "../../lib/bodyName";
import { useStore } from "../../store";

/**
 * ContextLine — what you are currently looking at, always.
 *
 * Replaces `FocusChip`, which said the same thing but only in the one case
 * where the sidebar was closed *and* a body was focused. That conditional
 * was a patch over a missing primitive: the app had no persistent answer to
 * "where am I", and the most valuable pixels on screen — top-left, largest
 * chrome type — spent themselves on the product's own name plus a decorative
 * "System Online". In a simulator that space belongs to state. The branding
 * keeps its mark and title; the second line now carries the answer.
 *
 * Behaviour carried over from FocusChip, unchanged:
 *   - Clicking re-opens the info panel for the focused body, and only when
 *     it is closed (`selectedId === null`).
 *   - It uses `setSelectedId`, never `selectId`: re-surfacing the panel for
 *     a body that is already focused is not a new navigation event and must
 *     not enter `focusHistory` (Codex PR 2 review).
 *
 * Honest in every state, which is why it never falls back to a guess:
 * a curated body reads as its name plus classification; a HYG focus reads
 * as "Star" (the `hyg:` prefix is all we know without the catalog here);
 * nothing focused reads as "Solar System", the actual ambient context.
 */
export const ContextLine = () => {
  const selectedId = useStore((s) => s.selectedId);
  const focusId = useStore((s) => s.focusId);
  const setSelectedId = useStore((s) => s.setSelectedId);
  const { i18n } = useTranslation();

  const body = focusId ? BODIES_BY_ID.get(focusId) : undefined;
  const isHygStar = focusId !== null && parseHygFocusId(focusId) !== null;

  const primary = body
    ? resolveBodyName(body.name, i18n.language)
    : isHygStar
      ? "Star"
      : "Solar System";
  const secondary = body
    ? (body.classification ?? body.type).toUpperCase()
    : null;

  // Clickable only when there is a panel to re-open.
  const canReopen = body !== undefined && selectedId === null;

  const content = (
    <>
      <span className="truncate font-orbitron uppercase tracking-[0.16em] text-white">
        {primary}
      </span>
      {secondary && (
        <span className="shrink-0 border-l border-white/15 pl-1.5 text-white/50">
          {secondary}
        </span>
      )}
    </>
  );

  const className =
    "mt-0.5 flex items-center gap-1.5 text-[8px] uppercase tracking-[0.18em]";

  if (!canReopen) {
    return (
      <div className={className} data-testid="context-line">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setSelectedId(focusId)}
      data-testid="context-line"
      aria-label={`Re-open details for ${primary}`}
      title={`Focused: ${primary}. Click to reopen the info panel.`}
      className={`${className} border-0 bg-transparent p-0 text-left transition-colors hover:text-nasa-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation`}
    >
      {content}
    </button>
  );
};
