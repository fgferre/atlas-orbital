# tasks/ — agent map (read this once)

**Do not browse this folder for inspiration.** Almost everything
under `archive/` is historical noise that confuses agents.

## Always (session start)

| File                           | Purpose                                       |
| ------------------------------ | --------------------------------------------- |
| [`../AGENTS.md`](../AGENTS.md) | **Law** — product constitution + coding rules |
| [`STATUS.md`](./STATUS.md)     | **Queue** — what to do next (only)            |

Claude Code also loads [`../CLAUDE.md`](../CLAUDE.md) (defers to AGENTS).

## On demand only

| File                         | When                                         |
| ---------------------------- | -------------------------------------------- |
| [`lessons.md`](./lessons.md) | STATUS cites `L##` / you hit a known trap    |
| [`waves/*.md`](./waves/)     | Only if STATUS names an **active** wave file |
| [`ROADMAP.md`](./ROADMAP.md) | Short index of open themes — not a work plan |

## Never open unless excavating history

| Path                                     | What it is                                       |
| ---------------------------------------- | ------------------------------------------------ |
| `archive/ROADMAP-gaia-port-era.md`       | ~2.4k lines Phase θ / Gaia port tiers            |
| `archive/waves/`                         | Closed wave plans (e.g. T6.4)                    |
| `archive/audits/`                        | 2026-07 multi-AI audits (many P0s already fixed) |
| `archive/sweeps/`                        | Opportunity / improvement swarms (idea mines)    |
| `archive/postmortems/`                   | Incident narratives                              |
| `archive/PLAN-orbital-path-a-2026-04.md` | Orbital Path A execution notes                   |

If an agent cites an archived path as current law, **stop** and
re-read `AGENTS.md` + `STATUS.md`.
