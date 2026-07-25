# STATUS — agent work queue

**Read with [`AGENTS.md`](../AGENTS.md).** That file is product law.
This file is only **what to do next**. Folder map: [`README.md`](./README.md).

_Last updated: 2026-07-24 (doc cleanup — archive noise out of hot path)._

---

## Active wave

**None.** No `tasks/waves/*.md` is active.

T6.4 (HYG visual recovery) agent work is complete; plan archived at
[`archive/waves/T6.4-visual-recovery.md`](./archive/waves/T6.4-visual-recovery.md).
User smoke acceptance (named-star fly-to, quality flip) may still be
informal QA — not an agent loop blocker.

**Default agent action on a fresh session:** do **not** invent a Gaia
port onda. Prefer user-stated tasks, or themes in
[`ROADMAP.md`](./ROADMAP.md) only after confirming with the user.

---

## Carryover (parked — do not auto-expand)

| ID       | Pri | Note                                                                                                                                                                                           |
| -------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U-smoke  | P2  | Optional user re-smoke of HYG fly-to / search / star panel after T6.4                                                                                                                          |
| Doc-debt | —   | Historical audits/sweeps live under `archive/`; re-check claims against **current** code before treating as open bugs                                                                          |
| Cross-AI | —   | Validation brief for external AI: [`archive/audits/cross-ai-validation-brief-2026-07-24.md`](./archive/audits/cross-ai-validation-brief-2026-07-24.md) (not a backlog — excavate + revalidate) |

Post–July 2026 audit fixes already landed on `main`/ahead branch
(frame, moons, `n`, mobile sidebar, CI gates, LOD, reduced-motion,
WebGL card, etc.). **Archived audit P0 lists are not a todo list.**

---

## Loop protocol (minimal)

```
1. Read AGENTS.md (constitution + test ratchet).
2. Read this STATUS (queue only).
3. If STATUS names an active wave file, read only that section.
4. Do not open archive/ unless excavating a specific historical claim.
5. Implement minimum diff; product contracts only (AGENTS §6).
6. Smallest verification: targeted test / lint / runtime smoke if render.
7. docs:check if you touched hot-path docs.
```

---

## Gate commands

- `npm run test:run` — CI-style unit (or `npm run test:run -- <pattern>`)
- `npm run lint`
- `npm run build`
- `npm run docs:check`
- `npm run test:e2e` — when changing boot/focus/a11y paths

Do **not** use `npm test --run` (deprecated).

---

## Archive links (excavation only)

- [`archive/`](./archive/) — ROADMAP Gaia era, waves, audits, sweeps, postmortems
- [`lessons.md`](./lessons.md) — operational traps (on-demand; L41 = Atlas constitution)
