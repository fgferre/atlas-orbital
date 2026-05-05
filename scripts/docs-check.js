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
const HOT_PATH_FILES = ["tasks/STATUS.md", "tasks/ROADMAP.md"];

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
    pattern: /First-ship MVP CLOSED/,
    why: "T6 visual failure 2026-05-04 invalidated 'MVP CLOSED' claims; superseded by T6.4 PRIORITY 0.",
    except: [],
  },
  {
    pattern: /HYG-?zoom path is live/i,
    why: "T6 mesh never renders visually at HYG positions; T6.4 wave is recovering.",
    except: [],
  },
  {
    pattern: /MVP genuinely closed/,
    why: "Same as above — T6 not delivered visually until T6.4 ships.",
    except: [],
  },
  {
    pattern: /M1-M7,?\s*~?11-17\s*h/,
    why: "T6.4 estimate updated to M1-M5+M7 core ~8-13h; M6 optional ~2-3h post-recovery.",
    except: [],
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
    // ROADMAP T2.0 ship row contains historical gate-output transcript
    // ("Gates green: `npm test -- --run` 873/873, ..."). Preserved for
    // git-blame traceability; pre-dates the AGENTS.md canonical pin.
    except: ["tasks/ROADMAP.md"],
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
 * Strip <details>...</details> blocks before checking — those are
 * explicitly history-preserved per ROADMAP migration convention.
 */
function stripDetailsBlocks(content) {
  return content.replace(/<details>[\s\S]*?<\/details>/g, "");
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
    const content = stripFencedCodeBlocks(stripDetailsBlocks(raw));
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

  if (hits === 0) {
    console.log(
      `✓ docs:check clean (${filesToCheck.length} file${filesToCheck.length === 1 ? "" : "s"} scanned, ${STALE_TERMS.length} stale-term patterns checked).`
    );
    process.exit(0);
  } else {
    console.error(
      `✖ docs:check found ${hits} stale-term hit${hits === 1 ? "" : "s"}. Fix above OR add an except path if intentional history.`
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
