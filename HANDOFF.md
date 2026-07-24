# Atlas Orbital — agent entry

## Read only this stack (in order)

1. **[`AGENTS.md`](./AGENTS.md)** — product constitution + engineering rules
2. **[`tasks/STATUS.md`](./tasks/STATUS.md)** — work queue
3. **[`tasks/README.md`](./tasks/README.md)** — what is hot vs archive

Claude Code: also [`CLAUDE.md`](./CLAUDE.md) (defers to AGENTS).

## Do not read by default

- `tasks/archive/**` — historical ROADMAP, audits, sweeps, closed waves
- `tasks/lessons.md` — only when STATUS cites a lesson ID
- `APRESENTACAO.md` — human pitch, not agent law

There is **no** `CODEX.md` / `GEMINI.md`. Other tools use AGENTS + STATUS.

## Verify

```
npm run docs:check
npm run lint
npm run test:run
npm run build
```

Rendering changes: browser smoke required (not unit green alone).
