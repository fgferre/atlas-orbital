## Foundation & Principles

- **Engineering Standards**: All code quality, security, and architectural principles are defined in **@AGENTS.md**.
- **Precedence**: Guidelines in AGENTS.md take absolute precedence for any code modification or system interaction.
- **Context**: Always read AGENTS.md at the start of every session to align with the project's engineering standards.

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

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

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

## Task Management (post-L38 restructure 2026-05-05)

1. **Hot path**: `tasks/STATUS.md` (Active wave + Carryover +
   Loop protocol). Single source of truth for "what's next."
2. **Active wave plan**: `tasks/waves/<wave>.md` is canonical
   for the current wave; ROADMAP/STATUS only pointer.
3. **Tracking progress within a session**: use the in-conversation
   `TodoWrite` tool, NOT a `tasks/todo.md` file. The doc tree
   layer is for cross-session canonical state, not session
   scratchpad.
4. **Documentation rule (L38)**: same fact lives in ONE canonical
   place; other docs link. Update wave-file milestone status when
   landing M; STATUS hot path only when Active wave changes or
   new Carryover findings emerge; lessons.md only for new
   reusable failure-mode rules.
5. **Final gate before commit**: `npm run docs:check` (catches
   doc drift mechanically).
