#!/usr/bin/env node
/**
 * docs:check — single-source-of-truth consistency sweep for the
 * hot-path docs (post-L38 restructure 2026-05-05).
 *
 * Greps STATUS.md (hot path), tasks/waves/*.md (active wave files),
 * and the active sections of ROADMAP.md for stale terms that
 * indicate drift between detail and summary, OR superseded
 * claims that survived a doc-correction cycle.
 *
 * Skips tasks/archive/ (history) and tasks/lessons.md M1-M6 olds
 * (pre-L38 format). The point is to catch contradictions in the
 * hot path that an agent driving a fresh /loop would actually
 * read first.
 *
 * Stale terms come from real bugs in the T6 doc-correction cycle
 * (commits 68b1d9f → 1f20e36 → 0b4c648 → 3b011d5). Each entry
 * encodes a known-bad phrase and the correct alternative.
 *
 * Usage: `npm run docs:check`. Exit code 0 = clean; 1 = stale
 * term found; 2 = unexpected error.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { readdirSync, statSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

/**
 * Files in scope for the consistency check.
 */
const HOT_PATH_FILES = [
  // Product constitution + engineering rules — multi-agent authority.
  "AGENTS.md",
  "tasks/STATUS.md",
  "tasks/ROADMAP.md", // short index only; history is archive/ROADMAP-gaia-port-era.md
  "tasks/README.md", // map: hot vs archive — keep free of stale product claims
  // HANDOFF.md is the fresh-conversation entry point — agent reads it
  // before STATUS, so stale claims here directly mislead kickoff.
  "HANDOFF.md",
  // CLAUDE.md is read by Claude Code at session start.
  "CLAUDE.md",
];

/**
 * Active wave files: discover any tasks/waves/*.md.
 */
function discoverWaveFiles() {
  const wavesDir = resolve(REPO_ROOT, "tasks", "waves");
  try {
    const entries = readdirSync(wavesDir);
    return entries
      .filter((name) => name.endsWith(".md"))
      .map((name) => `tasks/waves/${name}`);
  } catch {
    return [];
  }
}

/**
 * Stale-term registry. Each entry:
 *   pattern: regex matching the stale phrase
 *   why:     one-line rationale (printed on hit)
 *   except:  list of files allowed to contain the phrase
 *            (e.g. ROADMAP <details> blocks preserve historical
 *            text — those are explicitly allowed)
 */
const STALE_TERMS = [
  {
    pattern: /First-ship MVP CLOSED/i,
    why: "T6 visual failure 2026-05-04 invalidated 'MVP CLOSED' claims; superseded by T6.4 PRIORITY 0.",
    except: [],
  },
  {
    pattern: /HYG-?zoom path is live/i,
    why: "T6 mesh never renders visually at HYG positions; T6.4 wave is recovering.",
    except: [],
  },
  {
    // /i flag: catches "MVP genuinely CLOSED" (uppercase as in
    // commit-message-quote contexts) AND "MVP genuinely closed".
    pattern: /MVP genuinely closed/i,
    why: "Same as above — T6 not delivered visually until T6.4 ships.",
    except: [],
  },
  {
    // Per Codex post-restructure round-2 (2026-05-05): the stale
    // T6.3-ε ROADMAP row used both "double-audit-cleared" and
    // "user-driveable path" framing. Both claim functioning visual
    // delivery; both refuted by user smoke. Catch unsuperseded
    // forms (negation/SUPERSEDED markers ahead are legitimate).
    pattern: /\bdouble-audit-cleared\b/i,
    why: "Pre-2026-05-04 T6 success claim. Refuted by user smoke. Mark as SUPERSEDED inline or move to archive.",
    except: [],
  },
  {
    // Specific to T6 wave only — generic "user-driveable" in other
    // contexts (e.g. unrelated UX docs) is fine.
    pattern: /T6.{0,40}user-driveable\s+path/i,
    why: "Pre-2026-05-04 T6 success claim. The mesh doesn't render visually; path is not user-driveable end-to-end until T6.4 ships.",
    except: [],
  },
  {
    // Original T6.4 over-estimate "~11-17 h" pre-M6-promotion.
    // Now that M6 has shipped (sub-tracks A-H all ✅) and M7 has
    // landed agent-side, "M1-M7" is once again a valid milestone
    // enumeration — only the stale hour-band is forbidden here.
    pattern: /~?\s*11-17\s*h/i,
    why: "T6.4 estimate is now ~8-13h core + ~14h M6 forward-port; the ~11-17 h band predates the M6 promotion.",
    // Wave file's own "Audit history" section legitimately quotes
    // the prior estimate as it lists what each Codex round caught.
    except: [
      "tasks/waves/T6.4-visual-recovery.md",
      "tasks/archive/waves/T6.4-visual-recovery.md",
    ],
  },
  {
    // Positive-assertion form only. Negation contexts ("NOT
    // float32-comfortable", "is not comfortable") are legitimate
    // post-2026-05-04 corrections.
    pattern: /\b(is|stays|are)\s+float32-comfortable/i,
    why: "T6 visual failure proved parsec-scale solid meshes are NOT float32-comfortable; fix path is modelViewMatrix.",
    except: [],
  },
  {
    pattern: /npm test\s*--\s*--run/,
    why: "Deprecated form. Use `npm run test:run` (canonical, AGENTS.md Test commands).",
    // No file-wide except. ROADMAP T2.0 historical line should be
    // updated to canonical syntax (or moved to archive); blanket
    // ROADMAP except masked unrelated future drift per Codex
    // post-restructure audit 2026-05-05.
    except: [],
  },
  {
    // Function-call usage only. Meta-discussion ("stellarPhysicsFrom
    // does not exist", "Don't pretend stellarPhysicsFrom exists") is
    // documenting the bug — legitimate.
    pattern: /\bstellarPhysicsFrom\s*\(/,
    why: "Helper does NOT exist. Use individual exports (parseSpectralClass, temperatureFromSpect, radiusFromSpect, stellarVisualProfileFrom).",
    except: [],
  },
  {
    pattern: /radiusFromSpect\(null,\s*absmag\)\s*already/i,
    why: "FALSE PREMISE: stellarPhysics.ts:369 returns 1.0 immediately when spect is empty; absmag is never read in that path. M5 must add the fallback, not 'extend' it.",
    except: [],
  },
  {
    pattern: /modelViewMatrix\.elements\s+is\s+a\s+Float32Array/i,
    why: "FALSE: Matrix4.elements is Array<number> (float64). WebGL casts to float32 only at uniform upload. The CPU multiplication preserves precision.",
    except: [],
  },
  {
    pattern: /T6\.4 ships ONLY when all 7 milestones land/,
    why: "M6 is OPTIONAL post-recovery polish. Core ships when M1-M5 + M7 land.",
    except: [],
  },
  {
    // Per L38: pre-2026-05-04 claim that the HYG zoom path is
    // user-driveable end-to-end. Refuted by 2026-05-04 smoke.
    pattern: /(zoom into any HYG star|users can zoom.*procedural surface)/i,
    why: "Pre-2026-05-04 MVP claim. T6 mesh never rendered visually; T6.4 wave is the recovery path. Move to archive if quoting history.",
    except: [],
  },
];

/**
 * Structural invariants — these check higher-level facts that
 * regex alone misses. Per Codex post-restructure audit 2026-05-05.
 */
const STRUCTURAL_INVARIANTS = [
  {
    name: "T6.4 plan content lives in wave file, not ROADMAP",
    check: () => {
      const roadmap = readFileSafe("tasks/ROADMAP.md");
      const stripped = stripFencedCodeBlocks(stripHtmlComments(roadmap));
      // ROADMAP must NOT contain milestone-level T6.4 plan text.
      // Acceptable: pointer to wave file + brief status. Forbidden:
      // "M1 — Sphere shader" / "M2 — Glow + rays" / etc as section
      // headers (those are wave-file content).
      const milestoneHeaders =
        /^####?\s+M[1-7]\s+—\s+(Sphere shader|Glow|Smooth|Class variation|Spect-missing|HygStarPanel|Final cleanup)/m;
      if (milestoneHeaders.test(stripped)) {
        return `ROADMAP.md contains T6.4 milestone-level headers (M1-M7) which belong in tasks/waves/T6.4-visual-recovery.md per L38 single-source rule.`;
      }
      return null;
    },
  },
  {
    name: "STATUS hot path size",
    check: () => {
      const status = readFileSafe("tasks/STATUS.md");
      const lines = status.split("\n").length;
      const HOT_PATH_LIMIT = 300;
      if (lines > HOT_PATH_LIMIT) {
        return `STATUS.md has ${lines} lines (limit ${HOT_PATH_LIMIT}). Move history to tasks/archive/, wave detail to tasks/waves/, narrative to tasks/archive/postmortems/.`;
      }
      return null;
    },
  },
  {
    name: "Active wave file exists when STATUS claims an active wave",
    check: () => {
      const status = readFileSafe("tasks/STATUS.md");
      // Explicit idle queue: no wave file required.
      if (
        /\*\*None\.\*\*/.test(status) ||
        /No `tasks\/waves\/\*\.md` is active/i.test(status) ||
        /## Active wave\s*\n+\s*\*\*None\.\*\*/i.test(status)
      ) {
        return null;
      }
      // Live pointers only under tasks/waves/ (not archive/waves/).
      const matches = [
        ...status.matchAll(/(?<!archive\/)tasks\/waves\/([\w.+-]+\.md)/g),
      ];
      if (matches.length === 0) {
        return "STATUS.md has no active wave and does not say Active wave is None. Either point to tasks/waves/<file>.md or state **None.**";
      }
      for (const m of matches) {
        const filePath = `tasks/waves/${m[1]}`;
        try {
          statSync(resolve(REPO_ROOT, filePath));
        } catch {
          return `STATUS.md references ${filePath} but file does not exist.`;
        }
      }
      return null;
    },
  },
];

/**
 * Files allowed to contain ANY stale term (history / postmortem).
 * Skipped entirely.
 */
const SKIP_PATHS = [
  /^tasks\/archive\//, // history snapshots + postmortems
  /^node_modules\//,
  /^dist\//,
  /^\.git\//,
];

function shouldSkip(filePath) {
  return SKIP_PATHS.some((rx) => rx.test(filePath));
}

/**
 * Read file content; return empty string on missing.
 */
function readFileSafe(repoRelPath) {
  try {
    return readFileSync(resolve(REPO_ROOT, repoRelPath), "utf-8");
  } catch {
    return "";
  }
}

/**
 * Strip HTML comments only. Previously also stripped
 * <details>...</details> blocks but that masked stale claims
 * inside collapsed sections — per Codex post-restructure audit
 * 2026-05-05, <details> is NOT a free pass; if you put stale
 * content inside <details>, it still drifts. Migrate stale
 * content to tasks/archive/ instead.
 */
function stripHtmlComments(content) {
  return content.replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Strip code blocks (``` and indented) — script source / shader
 * snippets / commit message examples may contain stale terms as
 * documentation of what NOT to do.
 *
 * Heuristic: the rule's own definition file (this script) lives
 * in scripts/, NOT in tasks/, so it doesn't get checked anyway.
 * For tasks/*.md, fenced ``` blocks contain code samples (e.g.
 * shader snippets showing the OLD broken code path) which legitimately
 * contain stale phrases for explanation — strip them.
 */
function stripFencedCodeBlocks(content) {
  return content.replace(/```[\s\S]*?```/g, "");
}

function check() {
  const filesToCheck = [...HOT_PATH_FILES, ...discoverWaveFiles()].filter(
    (f) => !shouldSkip(f)
  );

  let hits = 0;
  for (const filePath of filesToCheck) {
    const raw = readFileSafe(filePath);
    if (!raw) continue;
    const content = stripFencedCodeBlocks(stripHtmlComments(raw));
    const lines = content.split("\n");

    for (const { pattern, why, except } of STALE_TERMS) {
      if (except.includes(filePath)) continue;
      lines.forEach((line, i) => {
        if (pattern.test(line)) {
          console.error(`✖ ${filePath}:${i + 1}`);
          console.error(`  matched: ${pattern.source}`);
          console.error(`  line:    ${line.trim().slice(0, 120)}`);
          console.error(`  why:     ${why}\n`);
          hits++;
        }
      });
    }
  }

  // Structural invariants pass.
  for (const inv of STRUCTURAL_INVARIANTS) {
    const failure = inv.check();
    if (failure) {
      console.error(`✖ structural invariant failed: ${inv.name}`);
      console.error(`  ${failure}\n`);
      hits++;
    }
  }

  if (hits === 0) {
    console.log(
      `✓ docs:check clean (${filesToCheck.length} file${filesToCheck.length === 1 ? "" : "s"} scanned, ${STALE_TERMS.length} stale-term patterns + ${STRUCTURAL_INVARIANTS.length} structural invariants checked).`
    );
    process.exit(0);
  } else {
    console.error(
      `✖ docs:check found ${hits} issue${hits === 1 ? "" : "s"}. Fix above OR add an except path if intentional history.`
    );
    process.exit(1);
  }
}

try {
  check();
} catch (err) {
  console.error("docs:check unexpected error:", err);
  process.exit(2);
}
