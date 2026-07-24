# AGENTS.md

Multi-agent constitution for this repo (Claude, Codex, Cursor, Grok,
OpenCode, etc.). If another doc (`tasks/STATUS.md`, `tasks/lessons.md`,
wave files, comments) conflicts with this file on **product principles**,
**this file wins**.

## Product constitution (non-negotiable quality)

Atlas Orbital optimizes for all of the following at once:

1. **Astronomical / scientific / physical fidelity** — real ephemerides,
   frames, and measured data where claimed; regressions vs Horizons
   fixtures and coordinate contracts are real bugs.
2. **Honesty** — never invent detail and present it as measured. Gaps and
   approximations must be disclosed (provenance, JSDoc, Credits, scale
   mode). Same discipline as the "not to scale" toggle.
3. **Realism with AAA cinematography (wow)** — reference-grade look is a
   product goal, not optional polish. Improve freely when it stays honest
   and physically grounded.
4. **Adaptive reach** — wow is additive on capable hardware and degrades
   to a fast floor via `src/lib/qualityProfile.ts` + `VISUAL_FIDELITY`
   tiers. A perf hit is tier-gated, not dumped on constrained learners.

**Ratchet rule:** quality on these axes may always **improve**; it must
never **worsen**. Implementation, ports, defaults, UI chrome, and look
constants **may change** when the ratchet holds (or honesty improves).

### Gaia Sky is not a product rule

Gaia Sky was an early **north star** and remains an optional technical
reference (patterns, papers, shaders in history). It is **not** a merge
gate, decision tie-breaker, or reason to reject a better Atlas path.
"Match Gaia" vs "Atlas opinion" → choose Atlas when fidelity, honesty,
and wow do not regress. Historical "DIFF GATE / pick Gaia" language in
STATUS, ROADMAP, or lessons is **superseded** by this constitution.

## Mandatory Principles (Always On)

1. Read the relevant files before changing code.
2. Preserve existing user changes unless explicitly told to replace them.
3. Make the smallest change that fully solves the issue: find the root cause, touch only necessary code, prefer small and reversible diffs. Avoid hacks, broad refactors, and rewriting working code.
4. Do not invent APIs, routes, data contracts, or environment assumptions.
5. Keep business logic in testable functions and UI glue thin.
6. **Tests are a quality ratchet, not an implementation freeze.** Add or
   update tests only when a change touches a **product contract**:
   ephemeris/error bands, coordinate frames, honesty/provenance, boot
   resilience that blocks seeing the scene, or a measurable high-tier
   visual/quality regression. Prefer few property/fixture asserts over
   many synthetic cases. **Do not** add suites for coverage theatre,
   DOM/Tailwind pins, or "mirror every line we just wrote." Improving
   render/UX **may delete** implementation-pinning tests in the same PR
   when they only freeze yesterday's form. Experimental look work needs
   **zero** new unit tests until the behavior stabilizes. Coverage floors
   are anti-lie metrics, not a volume target — deleting dead tests is OK.
7. Run the smallest meaningful verification before finishing.
8. Call out assumptions, known risks, and anything not verified.
9. Never use destructive git commands without explicit approval.
10. Keep documentation, scripts, and config aligned with the actual codebase.
11. Before creating any file, folder, or module — or reorganizing the structure: search for existing equivalents first. Only proceed if nothing fits (and explain why). Never rename, move, or reorganize unless explicitly requested.
12. Before finishing a task, do a cleanup pass: remove temporary debug code, dead branches, redundant helpers, and any legacy/shim introduced unless still required.
13. Follow the existing code style, patterns, and naming conventions of the project.
14. Robustness: Handle the full lifecycle of a feature: edge cases, error states, loading, and empty states. Don't just solve the "happy path".
15. Performance & Efficiency: Prioritize efficient code. Consider algorithmic complexity, unnecessary renders/re-renders, and network/resource usage.
16. Rationalization: Avoid over-engineering. Ensure technical decisions are rational, sustainable, and the simplest possible way to achieve the goal.
17. Clean Code Architecture: Ensure meaningful naming, SRP (Single Responsibility), and DRY (Don't Repeat Yourself) are applied to every module.
18. Visual/render fidelity follows the **Product constitution** above.
    **(a) Honest** and **(b) Adaptive** gates still apply. "Reference-grade"
    means auditable + physically-grounded + progressively-better-per-tier,
    not "exact clone of another app." Idea mines live under
    `tasks/archive/sweeps/` (do not treat as active backlog or Gaia law).

## Test commands

Use the named scripts from `package.json`, not raw vitest with
npm-arg-passthrough. The latter emits a deprecation warning
("Unknown cli config '--run'") and will break in future npm
major versions.

- `npm run test:run` — vitest in run mode (CI-style, exits
  after running). **Use this in gate sequences and pre-commit
  checks**, not `npm test --run` (deprecated form).
- `npm test` — vitest watch mode (interactive). For local
  development.
- `npm run test:coverage` — vitest run with `--coverage`.
- `npm run test:e2e` — Playwright suite (CI-ready, Chrome).
- `npm run test:e2e:ui` — Playwright in interactive UI mode.

For targeted runs (single file or pattern), use
`npm run test:run -- <pattern>` — the `--` is the canonical
npm passthrough delimiter that vitest receives cleanly.

## Browser automation

Two paths are available; pick the one that fits the task:

- **Playwright CLI** (`npx playwright test`, `npx playwright codegen <url>`, etc.) —
  the canonical path for CI-ready test suites, pixel-diff baselines, and any
  verification that must be reproducible headlessly. All specs under `e2e/`
  are authored here.
- **Claude Preview / browser MCP** — allowed for interactive iteration
  (quick visual checks, on-the-fly screenshots, console inspection while
  editing). Mind the operational caveats in `tasks/lessons.md` (HMR
  accumulation across many in-session edits can require a
  `preview_stop` + `preview_start` cycle to clear the R3F canvas state).

Both are legitimate. Don't spend test-runner time on things a one-off
screenshot would answer, and don't ship a pixel-diff regression gate via
a manual MCP snapshot — each tool has its lane.

When generating tests, outline the flow first, then use the CLI to help
create the implementation.
