# Phase θ — Gaia Sky visual parity kickoff

**Paste this file as the first message of a fresh Claude Code session.**
It's self-contained. Don't try to recall the prior session — the SHAs
and architecture are captured here.

---

## 0. What the next assistant must do BEFORE writing any code

Run these, in order. No code edits until all five are done:

1. **Read the project guardrails**: `AGENTS.md`, `CLAUDE.md`, `tasks/lessons.md`
   (especially **L14, L15, L17, L18, L19**), and
   `tasks/phase-gaia-sky.md` (the plan — treat as map, not as source of
   truth for shader math).
2. **Read the session memories** at
   `~/.claude/projects/C--Users-fgfer-OneDrive-Documents-GitHub-atlas-orbital/memory/`:
   - `MEMORY.md` (index)
   - `feedback_codex_auto_review.md`
   - `feedback_gaia_sky_source_first.md` ← **the rule that didn't exist last session**
   - `project_theta_rollback_2026-04-20.md` (what was rolled back + SHAs for
     recovery if needed)
3. **Clone Gaia Sky** outside the repo, shallow, read-only reference:
   ```bash
   git clone --depth 1 https://github.com/langurmonkey/gaiasky /tmp/gaiasky
   ```
   Leave it there. Don't copy any file into the atlas repo.
4. **Confirm current git state**: `git log --oneline -5` should show
   `5f84ba5` at HEAD (`docs(menu): §13 ledger backfill`). Anything else
   is drift — stop and ask.
5. **Start dev preview** via the MCP (`preview_start` with name
   `atlas-dev`), take a baseline screenshot. This is the **"linda"**
   starting state. Future visuals must keep or improve on it.

---

## 1. Where we are (2026-04-20, post-rollback)

### What's shipped and stays

- **Wave α** — HDR pipeline (NoToneMapping renderer + AgX composer),
  `graphicsSlice`, DisplayPanel, A11yPanel, persist v0→v1. Commits
  `73e75d3` / `73cd2c2` / `4601969` + polish. **Do not touch.**
- **AgX visual-preset recalibration** (`51c911d`, `ce66ff3`) — grading
  knobs tuned for post-AgX LDR space. **Do not touch.**
- **Heliocentric distance fix** (`42072fa`, `4dcd1cc`) — `resolveHeliocentric
DistanceAU` + scoring thresholds in AU. **Do not touch.**
- **Menu structure v3** — filing-cabinet rail + Gear popover + trapézio-
  isósceles tabs. `tasks/menu-structure-v3.md §13` is the decision
  ledger; deferred items land there, not in chat.
- **Phase θ spec** at `tasks/phase-gaia-sky.md` — the plan. Treat the
  prose as a map. **The Gaia Sky source files it cites are the actual
  territory.**

### What was rolled back on 2026-04-20

Seven commits invented shaders instead of porting them. User verdict:
_"as estrelas, os efeitos visuais de lente. me parece que vc nao fez
nada certo... está inventando codigo ao invges de portar"_. Rollback
target: `5f84ba5`. Rolled-back SHAs (recoverable via `git reflog` for
90 days):

- `6461dc4` feat(vfx): θ.2 spikes — invented cross kernel
- `4b49663` + `7f382bd` θ.6 grading — pmndrs library defaults, not
  ports of Gaia Sky's three shaders
- `25500be` + `054b95d` θ.13 Bayer dither — technically correct math
  but rolled back so the redo passes the same discipline
- `542c846` + `3b18c3e` θ.1 sprite kernel — invented `smoothstep` core,
  not Gaia Sky's `billboard.fragment.glsl` three-tier blend

---

## 2. The goal, restated

**Visual 1:1 match of Gaia Sky's effects, re-applied (not copied) in
our Three.js / R3F / TypeScript stack.**

- "1:1" refers to the **rendered pixels**, not to the source code.
- Re-apply with understanding: study the shader, grasp the math and
  the uniforms, adapt to three.js / `@react-three/postprocessing`
  idioms. No literal copy-paste of `.glsl` files.
- No license attribution ceremony in the commits — the user
  explicitly asked to skip that.
- Every onda ships only after **visual side-by-side** against a Gaia
  Sky reference screenshot passes the user's eye test.

---

## 3. Non-negotiable rules (learned the hard way last session)

### R1 — Read the source before the code

For every Phase θ onda that cites a `.frag.glsl` / `.vert.glsl`:

1. Locate the file in `/tmp/gaiasky`.
2. Read it in full. Trace every uniform, every function, every
   branch.
3. Read the adjacent shaders it calls into — `billboard.fragment.glsl`
   pulls from `lib/*`; `pseudolensflare.frag.glsl` reads the Bloom
   bright-pass buffer; etc. Follow the chain.
4. Write a 1-paragraph summary for the user: "Gaia Sky does X via Y.
   Atlas will re-apply as Z because W." Wait for approval.

### R2 — Visual reference before implementation

Find actual Gaia Sky screenshots / videos of the target effect:

- `gaiasky.space` gallery
- `github.com/langurmonkey/gaiasky/wiki` (has screenshots)
- YouTube playthroughs tagged "Gaia Sky"

Drop 1–3 references into `tasks/design/refs/gaia-sky-θ-N/` or just
paste them in chat for comparison. Without a reference, "looks OK"
is not verification.

### R3 — One onda at a time, no batching

- One commit per onda feature (`feat(vfx): θ.N — ...`).
- One Codex review per feature.
- One follow-up commit per Codex review, only after the user sees the
  findings.
- No starting θ.N+1 until θ.N has visual approval.

### R4 — Preserve the "linda" baseline

Before shipping an onda, screenshot boot + focused-Mars + Saturn-
closeup. After shipping, re-screenshot the same three. If anything
regresses on an unrelated surface, the onda is a no-go until
investigated.

### R5 — Codex review prompts include the Gaia Sky source inline

The `codex exec --sandbox read-only` tool can't fetch files. When
dispatching the review, the prompt must inline:

- The diff (`git show <SHA>`)
- The plan excerpt (`tasks/phase-gaia-sky.md §5 θ.N`)
- **The actual Gaia Sky shader the onda references** (cat from
  `/tmp/gaiasky`)
- The prior Codex review for context
- L-lessons cited

Without the shader inlined, Codex reviews the diff against the
invented plan and can't flag "this doesn't look like Gaia Sky".

### R6 — L-lessons are hard constraints

Any onda spec that mentions an L-lesson (L14 raw-axis anchoring, L15
useMemo ShaderMaterial, L17 DPR, L18 imperative clock, L19 hot-path
hygiene) must cite how the implementation honors it in the commit
message. A unit test pinning the invariant is preferred when
feasible.

### R7 — Minimum-viable scope, honest commit messages

If the plan calls for DisplayPanel toggles, Playwright spec, and
three baseline PNGs but the ship only has the shader + unit tests,
the commit message admits the scope cut AND the plan doc gets
aligned in the same commit. No silent deferrals.

---

## 4. Pre-onda checklist (fill before writing code)

For onda **θ.N**:

- [ ] Relevant Gaia Sky files identified:
  - Primary shader(s): `___`
  - Adjacent shaders called: `___`
  - Host code (Java) that wires the uniforms: `___`
- [ ] Source read in full (not skimmed)
- [ ] Visual reference captured/found: `___`
- [ ] 1-paragraph re-application writeup drafted
- [ ] User approved the writeup
- [ ] Pre-onda screenshot of atlas baseline taken
- [ ] Plan §5 θ.N re-read with source in mind
- [ ] Scope decided (minimum viable + what gets deferred where)

---

## 5. Per-onda protocol

```
1. git status must be clean. If not, resolve/stash first.
2. Run pre-onda checklist (§4 above).
3. Implement the onda. Shader math derives from the source study,
   not from imagination.
4. Run gates: npm run lint && npm run test:run && npm run build.
5. Preview visually, compare against the Gaia Sky reference.
   Report any perceptible mismatch BEFORE committing.
6. Run Playwright: npx playwright test --workers=1.
7. Commit with the honest message (§R7 above).
8. Auto-dispatch Codex review (feedback_codex_auto_review.md
   memory rule) — prompt includes inlined Gaia Sky source (§R5).
9. Read Codex findings. Apply agreed fixes in a fix commit. Flag
   anything ambiguous to the user before fixing.
10. Update tasks/phase-gaia-sky.md §5 θ.N to reflect shipped state.
11. Update tasks/menu-structure-v3.md §13 ledger IF the onda produced
    a deferred decision.
12. Only THEN move to θ.N+1.
```

---

## 6. Ordem recomendada de ondas (revisada pós-rollback)

Start where visual impact is highest + risk is bounded. The original
plan's §8 sequencing still applies but **θ.13 is NOT a freebie
anymore** — even the "technically correct" dither was rolled back so
we redo it under the new discipline.

1. **θ.1** — Star sprite kernel (`assets/shader/star.group.quad.*.glsl`
   - `billboard.fragment.glsl`). Foundation for θ.2/θ.3/θ.4/θ.14.
2. **θ.13** — Bayer dither (`assets/shader/lib/dither4x4.glsl`). Small,
   composer-terminal, no dependencies.
3. **θ.2** — Diffraction spikes. The plan suggested a per-star
   billboard shortcut — when reading the actual Gaia Sky source,
   decide whether that's still the right adaptation or whether
   the real lensdirt-based approach fits better.
4. **θ.6** — Grading finishes. Three separate shaders
   (`chromaticaberration`, `vignetting`, `filmgrain`). Decide
   per-effect whether pmndrs' library wrapper is acceptable (almost
   certainly not — lib defaults shipped wrong last time).
5. Beyond that, follow `tasks/phase-gaia-sky.md §8`.

---

## 7. Dev environment reminders

- Primary working dir: `C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital`
- Git: branch `main`, local-only (no push has happened for any Phase
  θ work).
- Preview MCP: `preview_start` with name `atlas-dev`. Cycle via
  `preview_stop` + `preview_start` if HMR accumulates across edits
  (L11).
- Playwright: `npx playwright test --workers=1`. `playwright.config.ts`
  owns the preview lifecycle (port 4174, `--strictPort`).
- Codex: `codex exec --sandbox read-only --skip-git-repo-check -`
  with stdin from the prompt file. Dispatch in background via
  `run_in_background: true` and wait for the notification.
- The user is in `auto` mode by default — execute, don't ask for
  routine approvals. DO pause before anything destructive, scope-
  expanding, or visually subjective.

---

## 8. First message to the user after reading this kickoff

Not "what should we do first". Say:

> "Li AGENTS.md + CLAUDE.md + lessons.md + as 3 memórias + o spec do
> Phase θ. Clonei Gaia Sky em `/tmp/gaiasky`. HEAD está em `5f84ba5`,
> working tree limpo, preview `atlas-dev` rodando.
>
> Proposta pra θ.1 star sprite kernel: vou abrir
> `/tmp/gaiasky/assets/shader/star.group.quad.fragment.glsl` e
> `billboard.fragment.glsl`, estudar em detalhe, e voltar com 1
> parágrafo de entendimento antes de tocar em código. Ok seguir
> assim?"

That's the contract. If the assistant skips any item in §0 or dives
straight into code, stop it.
