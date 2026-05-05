# Atlas Orbital — fresh-conversation entry point

**Stub** (post-2026-05-05 doc restructure per L38). The full prior
content (Wave α 2026-04-18 + white-canvas remediation 2026-04-24

- pre-Wave-α facts) is preserved in git history at the prior
  commit; not retained here because it stale-directed loops back
  to T5.3 / Wave α as "current position" instead of T6.4
  (active recovery wave).

## Where to start

1. **Read `tasks/STATUS.md`** — hot path, ~200 lines, single
   source of truth for "what's the next action."
2. **Read the Active wave file** that STATUS points to (today:
   `tasks/waves/T6.4-visual-recovery.md`).
3. **Read `tasks/lessons.md`** for operational rules
   (compact format L37+; pre-L38 M1-M6 narratives still verbose).
4. Use `/tmp/gaiasky/` for Gaia source cross-references.

## Engineering standards

- `AGENTS.md` — repo-level engineering rules (test commands,
  browser automation, etc.)
- `CLAUDE.md` — Claude Code-specific harness instructions
- `~/.claude/projects/.../memory/MEMORY.md` — auto-memory rules
  that cross sessions

## Doc layout (post-2026-05-05 restructure)

```
tasks/
├── STATUS.md                   # hot path — Active wave + Carryover + protocol
├── ROADMAP.md                  # strategic index — pointers to wave files
├── lessons.md                  # operational rules
├── waves/                      # canonical per-wave plans (active or upcoming)
│   └── T6.4-visual-recovery.md
└── archive/                    # history (do not direct work here)
    ├── status-history-*.md     # snapshots of pre-restructure STATUS
    └── postmortems/
        └── T6-visual-failure.md
```

## Verification before declaring "ready"

```
npm run docs:check    # consistency sweep across hot-path docs
npm run lint
npm run test:run
npm run build
```

Per L37 (rendering claims need runtime smoke): if the wave
touches shaders/materials/canvas/scene-tree, runtime smoke via
Preview MCP is mandatory before declaring shipped.

---

_The rest of the handoff narrative (Wave α retrospect, Tycho
data provenance facts, scientific reality assessment, etc.)
moved to git history as part of the 2026-05-05 STATUS hot-path
restructure. Recover via `git log -p HANDOFF.md` if needed._
