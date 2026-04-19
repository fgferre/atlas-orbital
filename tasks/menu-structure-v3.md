# Menu Structure v3.1 — Atlas Orbital

**Status**: authoritative spec for the Route A item 4 restructure.
**Supersedes**: rail-and-panel IA prior to this document.
**Validated against**: first-use flow + precedents (NASA Eyes, Stellarium, Celestia, Universe Sandbox, CP2077/Starfield) + code contracts (`store`, `viewport framing`, tutorial, existing modals, tests).
**Date**: 2026-04-19.

---

## 1. Context

Wave α landed `graphicsSlice` + `Display` + `A11y` as user-facing surfaces. The rail that grew around them (Search / Scene / Overlay / Display / Access / Project) became a 6-tab permanent chrome that neither AAA nor science-tool traditions use well. This spec restructures the chrome for functional hierarchy, zero control loss, and accommodation of the β/γ/η/R3 growth already committed in `implementation-roadmap.md` and `graphics-settings-design.md`.

**Conservative stance on Search**: Search remains a rail tab (not promoted to TopBar). A discussion considered NASA-Eyes-style top-center search, but the refactor cost — `ViewportFramingTracker` rework, tutorial target anchor migration, `RightControlPanelId` enum changes, camera composition re-baseline — outweighs the discovery gain given Atlas's ~50-body catalog. A `/` keyboard hotkey is added instead as a low-cost power-user affordance.

Not in scope here: adding new graphics features. Those are wave-scoped PRs.

## 2. Principles

1. **Spectacle dominates chrome.** The 3D view is the product.
2. **Three-tier progressive disclosure.** Primary (always visible), Secondary (1 click), Tertiary (2 clicks / popover).
3. **One surface, one job.** No grab-bag tabs.
4. **No active control costs >1 click without frequency justification.**
5. **No duplicated control survives.**
6. **No placeholder visible without real backing.** (Corollary of the "no 'coming soon' headers" rule.)

## 3. Information Architecture

### Tier 1 — Permanent chrome

| Surface           | Desktop                                                             | Mobile                            |
| ----------------- | ------------------------------------------------------------------- | --------------------------------- |
| TopBar            | `[brand + status]` `[◁ Back]` `[⌂ Home]` `[focus chip]` `[⚙ Gear]` | `[brand icon]` `[◁]` `[⌂]` `[⚙]` |
| Sidebar (left)    | body info panel, existing                                           | bottom sheet, existing            |
| Timeline (bottom) | time controls, existing                                             | collapsed default, existing       |
| Rail (right)      | 4 tabs: `Search \| View \| Display \| Access`                       | same, vertical                    |

### Tier 2 — Rail panels

| Tab     | Panel header            | Content                                                                                                                               |
| ------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Search  | "Search"                | unchanged from current `SearchBar.tsx`                                                                                                |
| View    | "View"                  | `World` · `Bodies` · `Guides` · `Backdrop` (accordion subsections)                                                                    |
| Display | "Display" + preset chip | `Rendering` · `Post-Processing` · `Camera Effects` (hidden) · `Atmosphere & Sun` · `Textures & LoD` (hidden) · `Performance` (hidden) |
| Access  | "Accessibility"         | `Reduced Motion` · `UI Scale` · grayed-in-place rows for Wave 4 activation                                                            |

### Tier 3 — Gear popover

`[⚙]` opens a lightweight popover (desktop) or top-anchored sheet (mobile). Three sections:

| Section   | Items                                                                        |
| --------- | ---------------------------------------------------------------------------- |
| Help      | Replay Tutorial (Ctrl+Shift+T), Keyboard shortcuts reference                 |
| About     | Mission Report (launches existing `CreditsModal`), credits + links, `v0.1.0` |
| Developer | Debug Logging toggle                                                         |

## 4. Surface detail

### 4.1 TopBar

Current [`TopBar.tsx`](../src/components/ui/TopBar.tsx) ships a minimal top-left cluster (brand + Back + Home). v3.1 adds the Gear button and a conditional focus chip, **without adopting full-width layout** and **without integrating Search**. Height remains constant.

Desktop layout (≥ 768 px):

- `[brand + status]` cluster — existing
- `[◁ Back]` `[⌂ Home]` — existing
- `[focus chip]` — new, conditional (see §5.1)
- `[⚙ Gear]` — new, right

Mobile layout (< 768 px):

- `[brand icon]` — brand collapses to the glyph already present in `TopBar.tsx:40-42` (no text at ≤ 360 px)
- `[◁]` `[⌂]` — icon-only, preserved
- `[⚙]` — opens sheet-from-top

### 4.2 Rail

Four tabs, ordered top-to-bottom (vertical rail on both breakpoints): `Search | View | Display | Access`.

Rail label ≤ 7 chars (documented cap in [`controlPanelConfig.ts:40-46`](../src/components/ui/controlPanelConfig.ts)). All 4 labels pass (Search = 6, View = 4, Display = 7, Access = 6).

### 4.3 View panel

Four accordion subsections.

```
View
├── World
│   └── Scale: Didactic | Realistic
├── Bodies
│   └── Categories: Planets | Moons | Dwarfs | Asteroids | TNOs
├── Guides
│   ├── Icons | Labels | Orbits | Context Orbits (conditional on Orbits)
│   ├── Ecliptic Grid
│   └── Prograde Vector
└── Backdrop
    ├── Starfield: toggle
    ├── Source: HYG | NASA
    └── [status line]
```

Collapse defaults:

- **Desktop**: all 4 subsections open. Preserves zero-regression on current Scene + Overlay (both ship as fully-visible panels today).
- **Mobile**: all 4 collapsed. User taps to expand.

Accordions available on both breakpoints — only the initial state differs.

Behaviors:

- `Orbits` toggle off → `Context Orbits` hides (existing conditional preserved).
- `Starfield` toggle off → source status line shows the "hidden — re-enable to compare" message (existing behavior preserved).

### 4.4 Display panel

Preserves current `DisplayPanel.tsx` structure, with additions:

- **Header preset chip** (new): "Current preset: Ultra" or equivalent, derived from `qualityProfile.name` + `graphicsAutoMode`. Replaces the Quality signpost removed from the old Scene panel.
- **Sun Render absorbed** into `Atmosphere & Sun` subsection — removed from the old Scene panel.
- Reserved subsections (hidden until backing lands):
  - `Camera Effects` — populated in Wave γ / η.x per authoritative roadmap list (do not hardcode effect names here)
  - `Textures & LoD` — activated in R3 Wave 5
  - `Performance` — activated when `performance.memory` is available; auto-downgrade lands in Wave N

### 4.5 Access panel

No structural change. Panel header remains "Accessibility" (full word). Rail label is "Access" (compressed for cap) — this split is documented and intentional, not a bug.

Grayed rows (`Colorblind Mode`, `High Contrast`) remain hidden-in-place until Wave 4 activation.

### 4.6 Search panel

No structural change. [`SearchBar.tsx`](../src/components/ui/SearchBar.tsx) remains as-is architecturally (sibling of LayersPanel in the right-rail container). The only addition is a global `/` keyboard hotkey (see §5.6) that opens and focuses the Search panel.

### 4.7 Gear popover

Lightweight affordance. **Not a full-screen modal**. Reasoning: Mission Report already launches [`CreditsModal.tsx`](../src/components/ui/CreditsModal.tsx) which owns its focus trap. Nesting two modals causes ambiguous close semantics and focus-stack a11y hazards.

Behaviors:

- Click outside → dismiss popover.
- Item that launches a modal (Mission Report) → **close popover + open the target modal**. Closing that modal returns to 3D view, does not re-open the popover.
- Desktop: positioned as dropdown anchored to the `[⚙]` button.
- Mobile: sheet slides from top (compact, ~60 % viewport height max).

### 4.8 Sidebar and Timeline

Unchanged from current behavior. See §5.1 for the `focusId` interaction affecting the new TopBar focus chip.

## 5. Behavioral contracts

### 5.1 Focus chip semantics

The TopBar focus chip is a conditional element, not always-on. Contract:

- **Visibility**: `selectedId === null && focusId !== null`
- **Content source**: `BODIES_BY_ID.get(focusId)` — renders name + classification chip similar to existing `HeaderChip` in [`Sidebar.tsx:423-427`](../src/components/ui/Sidebar.tsx)
- **Rationale**: Closing the Sidebar clears `selectedId` (see [`Sidebar.tsx:107`](../src/components/ui/Sidebar.tsx)), but `focusId` persists — the camera is still focused on a body. The chip fills that breadcrumb gap. Never mirrors the Sidebar content.
- **Interaction**: clicking the chip re-opens the Sidebar (equivalent to `setSelectedId(focusId)`).

### 5.2 Search arbitration

Search remains a rail panel participating in the `RightControlPanelId` enum with `activePanel` / `queuedPanel` arbitration in [`controlPanelConfig.ts:55`](../src/components/ui/controlPanelConfig.ts). No change to the state machine.

The `/` hotkey (§5.6) is a convenience accelerator that dispatches a `setActivePanel("search")` and focuses the input — identical semantics to clicking the Search rail tab.

### 5.3 Viewport framing

[`ViewportFramingTracker.tsx:83-110`](../src/components/ui/ViewportFramingTracker.tsx) measures `topBarRect`, `timelineRect`, `sidebarRect`, `searchRailRect`, `settingsRailRect`. With Search staying in the rail, all 5 rects persist. [`effectiveViewport.ts:33`](../src/lib/camera/effectiveViewport.ts) math is unaffected.

Minor downstream deltas to verify:

- `settingsRailRect` changes shape — 4 tabs become 3 after Project demote to Gear (Search still there). Marginally narrower rail; `overlayInsets.right` shrinks slightly.
- `topBarRect` grows to accommodate Gear button + optional focus chip; `overlayInsets.top` grows marginally.

**Validation requirement**: the PRs that modify rail or TopBar must include screenshot diffs of the 3D view to confirm camera framing is visually consistent.

### 5.4 Tutorial highlight target stability

[`TutorialHighlight.tsx:27`](../src/components/ui/TutorialHighlight.tsx) resolves `data-tutorial-target` via DOM polling. Existing targets preserved:

- `data-tutorial-target="search"` — remains on the existing Search rail tab.
- `data-tutorial-target="settings"` — remains on the rail (now 3 tabs after Project demote).
- `data-tutorial-target="info-panel"` — unchanged on Sidebar.
- `data-tutorial-target="timeline"` — unchanged.

No target migration needed. Tutorial Step 5 ("Pull the Search drawer from the edge tabs") copy remains valid.

### 5.5 One-time transition hint

On first open of the new View panel after the restructure ships, show an inline dismiss-able hint:

> Quality & render settings moved to Display.

Persistence:

- **localStorage key**: `atlas-restructure-hint-v1:dismissed` (boolean).
- Namespaced with `v1` so future hints can use `v2`, `v3` without collision.
- Does **not** touch the Zustand store. Rationale: avoids migration scope and test updates for store persistence. Isolated responsibility.

### 5.6 Keyboard shortcuts

| Key                | Action                                  | Status                                                                                                                                                                       |
| ------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` or `Ctrl+K`    | Open Search panel + focus input         | **new** (opens existing rail panel via hotkey)                                                                                                                               |
| `H`                | Focus home (Sun)                        | existing                                                                                                                                                                     |
| `Alt+←`            | Focus back                              | existing                                                                                                                                                                     |
| `Ctrl+Shift+T`     | Replay tutorial                         | existing                                                                                                                                                                     |
| `?`                | Open Keyboard Shortcuts reference modal | **new** (listed in Gear > Help)                                                                                                                                              |
| ~~`Ctrl+Shift+D`~~ | —                                       | **removed from tutorial** (`Scene.tsx:303-310` documents it has no visible effect post-Leva retirement). Restoration, if desired, is a separate PR outside this restructure. |

## 6. Regression audit — zero controls lost

| Current                    | New destination               | Clicks delta (boot → access)                  |
| -------------------------- | ----------------------------- | --------------------------------------------- |
| Search rail tab            | Search rail tab (unchanged)   | 1 → 1 (or 0 via `/`)                          |
| Overlay > Categories       | View > Bodies                 | 1 → 1                                         |
| Overlay > Guides (6 items) | View > Guides                 | 1 → 1                                         |
| Scene > Starfield + Source | View > Backdrop               | 1 → 1 (desktop default open)                  |
| Scene > Scale Mode         | View > World                  | 1 → 1 (desktop default open)                  |
| Scene > Quality signpost   | Display header preset chip    | replaced by permanent surface                 |
| Scene > Sun Render         | Display > Atmosphere & Sun    | 1 → 1 (dup resolved)                          |
| Display > all              | Display (unchanged)           | 1 → 1                                         |
| A11y > all                 | Access (unchanged)            | 1 → 1                                         |
| Project > Replay Tutorial  | Gear > Help                   | 1 → 2 (episodic use)                          |
| Project > Mission Report   | Gear > About (→ CreditsModal) | 1 → 2 (rare)                                  |
| Project > Debug Logging    | Gear > Developer              | 1 → 2 (dev tool, hotkey candidate for future) |
| Project > version          | Gear > About                  | 1 → 2 (label only)                            |

Demote to 2 clicks: all Project items, justified by episodic frequency (Principle 4).

## 7. Growth accommodation

| Wave        | Surface                   | Addition                                                                                   | Spec impact                         |
| ----------- | ------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------- |
| γ           | Display > Post-Processing | `Tone Mapping` dropdown activates (current `disabled` in `DisplayPanel.tsx:276-285` lifts) | none (structure ready)              |
| γ / η.x     | Display > Camera Effects  | subsection populated per authoritative roadmap                                             | none (subsection reserved)          |
| η.6         | Display > Post-Processing | Exposure slider                                                                            | none (structure ready)              |
| R3 Wave 5   | Display > Textures & LoD  | subsection populated                                                                       | none (subsection reserved)          |
| A11y Wave 4 | Access                    | Colorblind + High Contrast activate                                                        | none (grayed rows already in place) |
| Future      | Gear > About              | Save/Load project state                                                                    | new section (additive)              |
| Future      | View > Bodies / Guides    | New categories / overlay types                                                             | accordion accommodates              |

No subsection is exposed with empty content. The "no `coming soon` headers" rule (per `graphics-settings-design.md:66`) applies throughout.

## 8. Scope in / out

### In scope for the restructure PRs

- Rail 6 → 4 tabs (`Search | View | Display | Access`)
- Scene + Overlay consolidation into View with accordion
- Project demotion to Gear popover
- `focusId`-conditional focus chip in TopBar
- `[⚙ Gear]` button added to TopBar
- Display header preset chip (replaces Scene Quality signpost)
- Sun Render dedup
- Tutorial copy rewrite: step 6 (Control Stack) only — describes new View + Display + Access + Gear
- One-time hint + localStorage persistence
- Removal of `Ctrl+Shift+D` mention from tutorial Pro Tips
- `/` and `?` keyboard hotkeys
- All test updates listed in §10

### Explicitly out of scope

- Search relocation to TopBar (evaluated and rejected — refactor cost exceeds discovery gain)
- TopBar full-width expansion (not needed without Search integration)
- Activation of Tone Mapping, Exposure, or any Camera Effects
- New graphics controls beyond existing Wave α set (no V-Sync, FPS target, SSR, SSAO, texture-tier, HDR path)
- Body selector tree in Sidebar
- "Goto coordinate" dialog
- "Currently visible objects" panel
- Save/Load project state (lands in Gear > About in a future wave)
- Restoration of `Ctrl+Shift+D` hotkey (candidate for separate PR, does not block spec)
- Changes to `graphicsSlice` shape (frozen post-Wave α)
- Changes to orbital engine, rendering pipeline, or visual grading

## 9. Files touched

### Modified

- `src/components/ui/controlPanelConfig.ts` — remove `"overlay"` and `"project"` from `RightControlPanelId` enum and `RIGHT_CONTROL_BUTTONS`. Rename `"scene"` → `"view"`. Search entry stays. **Also delete dead `SCENE_QUALITY_OPTIONS` export** (only referenced by its own test today; Quality signpost removal makes it formally unused).
- `src/components/ui/LayersPanel.tsx` — remove Overlay rendering, rename Scene → View, add accordion structure, remove Quality block, remove Sun Render rendering (lives in Display), remove Project rendering.
- `src/components/ui/TopBar.tsx` — add `[⚙]` button (right) and conditional focus chip. Height and general layout preserved (no full-width expansion).
- `src/components/ui/Overlay.tsx` — wire `GearPopover` open/close state (separate from `RightControlPanelId`).
- `src/components/ui/TutorialOverlay.tsx` — rewrite step 6 (Control Stack) only. Remove `Ctrl+Shift+D` line from step 8.
- `src/components/ui/DisplayPanel.tsx` — add preset chip to header.
- `src/components/ui/ViewportFramingTracker.tsx` — update panel id fallback list (line 40-44): remove `"atlas-overlay-panel"` and `"atlas-project-panel"`; add `"atlas-view-panel"`.
- `src/components/ui/A11yPanel.tsx` — no change required.
- `src/components/ui/SearchBar.tsx` — no structural change. May add `data-tutorial-target` stability check if not already on a stable element.
- `src/store.ts` — no change to core semantics. Possibly add `gearOpen: boolean` + setter for Gear popover state.
- `src/lib/camera/effectiveViewport.ts` — no code change; tests re-baseline for marginal inset deltas.

### Added

- `src/components/ui/GearPopover.tsx` — lightweight popover with Help/About/Developer sections, dropdown-to-modal handoff for Mission Report.
- `src/components/ui/KeyboardShortcutsModal.tsx` — simple modal listing the shortcuts in §5.6, triggered from Gear > Help and from `?` hotkey.
- `src/components/ui/FocusChip.tsx` — the conditional breadcrumb in TopBar.
- `src/components/ui/primitives/Accordion.tsx` — collapsible section primitive used by View panel.

### Removed

- No source files removed.

## 10. Test updates

| File                                                                               | Change                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`controlPanelConfig.test.ts:17`](../src/components/ui/controlPanelConfig.test.ts) | assert new order `Search \| View \| Display \| Access`; `overlay` + `project` removed from enum; `scene` renamed to `view`.                                                                                                                                                               |
| [`SearchBar.test.tsx`](../src/components/ui/SearchBar.test.tsx)                    | minor — assert `/` hotkey opens panel; core behavior unchanged.                                                                                                                                                                                                                           |
| [`LayersPanel.test.tsx:42`](../src/components/ui/LayersPanel.test.tsx)             | rename / rewrite for View consolidation; assert accordion collapse defaults by breakpoint; assert Overlay + Scene + Project tabs absent.                                                                                                                                                  |
| [`effectiveViewport.test.ts:58`](../src/lib/camera/effectiveViewport.test.ts)      | re-baseline with marginal inset deltas (rail 6 → 4 tabs; TopBar gains Gear + focus chip).                                                                                                                                                                                                 |
| Tutorial copy (if test coverage exists)                                            | update assertions for step 6 new text; step 5 unchanged.                                                                                                                                                                                                                                  |
| Playwright / e2e visual coverage (if present)                                      | audit any spec that screenshots the rail, Scene/Overlay/Project panels, or tutorial step 6 copy — re-baseline under the new 4-tab rail + View panel + Gear popover. Applies especially to any `e2e/` spec touching `data-ui-framing`, `data-right-control-trigger`, or panel-open states. |
| **Added**: `GearPopover.test.tsx`                                                  | popover open/close, focus management, Mission Report handoff to CreditsModal.                                                                                                                                                                                                             |
| **Added**: `FocusChip.test.tsx`                                                    | visibility conditions on `selectedId` / `focusId` combinations.                                                                                                                                                                                                                           |
| **Added**: `KeyboardShortcutsModal.test.tsx`                                       | `?` hotkey trigger + content.                                                                                                                                                                                                                                                             |
| **Added**: `Accordion.test.tsx`                                                    | expand/collapse + default state by breakpoint.                                                                                                                                                                                                                                            |

No existing tests are removed.

## 11. Validation gates

Before merging the restructure:

1. **First-use flow**: run the tutorial end-to-end on a clean profile. Step 6 copy must read correctly against the new chrome. Target anchors must highlight the right elements.
2. **Returning-user flow**: open the View panel on a profile with no hint dismissal — verify the one-time hint renders. Dismiss, re-open — verify it does not return. Clear localStorage — verify it returns.
3. **Focus chip**: select a body → Sidebar opens → close Sidebar → chip must appear with the correct name. Click chip → Sidebar re-opens. Navigate away (`focusBack` / `focusHome`) → chip updates.
4. **Search unchanged**: open Search panel → type → quick jumps work → select a body → panel closes (current behavior preserved).
5. **`/` hotkey**: in 3D view (not typing), press `/` → Search panel opens and input is focused. Press Escape once → clears query. Press Escape again → closes panel.
6. **Camera framing**: take a screenshot of the 3D view with a known body focused on main before merging, and one after. The delta must be zero or visibly trivial and explainable by the `overlayInsets` shift documented in §5.3.
7. **Gear modal chain**: open Gear popover → click Mission Report → verify Gear closes + CreditsModal opens. Close CreditsModal → verify return to 3D view (not back to Gear).
8. **Mobile TopBar**: at 360 px width, verify all 4 TopBar items (`[brand icon]` `[◁]` `[⌂]` `[⚙]`) fit without clipping or overlap.
9. **Accessibility**: keyboard navigation works for every new affordance (TopBar buttons, Gear popover, accordion headers in View). Focus trap on modals.
10. **Test suite green**: all updated tests pass. Visual regression suite (if present) re-baselined.

## 12. Open-ended follow-ups (not blocking this spec)

- Decide whether `Ctrl+Shift+D` restoration is worth a small follow-up PR.
- Evaluate whether `?` keyboard shortcut is discoverable enough, or if a tiny "keyboard icon" in the TopBar would help.
- Consider whether the focus chip should also surface during live time mode (when the app auto-follows a moving body).
- Re-evaluate Search relocation to TopBar only if catalog grows significantly beyond current ~50 bodies (rationale in §1).

None of these block merging the restructure.
