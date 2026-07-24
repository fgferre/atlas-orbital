## Foundation & Principles

- **Engineering + product constitution**: defined in **@AGENTS.md**
  (fidelity, honesty, AAA wow, adaptive tiers; Gaia is **not** a product
  rule; tests are a quality ratchet, not an implementation freeze).
- **Precedence**: `AGENTS.md` wins over `tasks/STATUS.md`,
  `tasks/lessons.md`, wave files, and any "match Gaia" / DIFF GATE
  language left in historical docs.
- **Context**: Read `AGENTS.md` at the start of every session. Use
  `tasks/STATUS.md` for _what wave is active_, not for product law.

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop (post-L38 restructure 2026-05-05)

- Lessons live in `tasks/lessons.md` as **short rules** (Trigger /
  Rule / Action / Source — max ~12 lines each). Long narratives go
  to `tasks/archive/postmortems/<incident>.md`, NOT inline in
  lessons.md.
- After a correction surfaces a NEW failure-mode pattern (not just
  a project-specific bug): add a short rule. Postmortem captures
  the narrative. **Do NOT** append verbose folds — that recreates
  the inflation L38 prevents.
- Consult lessons.md on-demand (referenced by ID from STATUS or
  the active wave file), not as session-start mandatory read.
- Lessons that assume "Gaia is the decision rule" or "port 1:1 is
  mandatory" are **historical**; apply only as optional technique
  when useful, never as a veto on Atlas improvements.

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask: "Did fidelity / honesty / wow improve or hold? Did anything worsen?"
- Run the **smallest** meaningful check (targeted tests, not a new suite)
- Do **not** bulk-add tests "because the feature changed" — see AGENTS.md §6

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes -- don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests -- then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how
- If a test fails only because it pins old implementation / Gaia parity
  and the change **improves** product quality, update or **delete** that
  test — do not abandon the improvement to keep a bad pin green

## Task Management

1. **Entry**: `HANDOFF.md` → `AGENTS.md` → `tasks/STATUS.md`.
   Folder map: `tasks/README.md`. **Do not browse `tasks/archive/`.**
2. **Hot path**: `tasks/STATUS.md` = work queue only. Constitution =
   `AGENTS.md`.
3. **Active wave**: only if STATUS names `tasks/waves/<file>.md`.
   No active wave → do not invent one from archive/ROADMAP history.
4. **Session tracking**: in-conversation todos, not a `tasks/todo.md`.
5. **L38**: one fact, one place. lessons.md only for new failure-mode
   rules (short). Archive holds history.
6. **Before commit**: `npm run docs:check` if docs changed.
