"""Build the Codex θ.1 review prompt by substituting placeholders in
`tasks/codex-review-theta-1-prompt.txt` with inlined material.

Run from the repo root:
    python tasks/build-theta-1-context.py

Outputs `tasks/codex-review-theta-1-context.txt` ready for
    codex exec --sandbox read-only --skip-git-repo-check - < tasks/codex-review-theta-1-context.txt
"""

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROMPT = ROOT / "tasks" / "codex-review-theta-1-prompt.txt"
OUT = ROOT / "tasks" / "codex-review-theta-1-context.txt"
import os
GAIASKY = Path(os.environ.get("TEMP", "/tmp")) / "gaiasky"
if not GAIASKY.exists():
    GAIASKY = Path("/tmp/gaiasky")

def extract_section(text, start_re, end_re):
    """Return everything from the first line matching start_re up to but not including end_re."""
    lines = text.splitlines(keepends=True)
    out = []
    capture = False
    for line in lines:
        if re.match(start_re, line):
            capture = True
        if capture and re.match(end_re, line):
            break
        if capture:
            out.append(line)
    return "".join(out).rstrip() + "\n"

def main():
    prompt_text = PROMPT.read_text(encoding="utf-8")

    # 1. git show the commit
    git_show = subprocess.check_output(
        ["git", "show", "2662f08"], cwd=ROOT, text=True, encoding="utf-8"
    )

    # 2. plan §5 θ.1 excerpt
    plan = (ROOT / "tasks" / "phase-gaia-sky.md").read_text(encoding="utf-8")
    plan_excerpt = extract_section(plan, r"^### θ\.1 —", r"^### θ\.2 —")

    # 3. Gaia Sky shaders
    gs_frag = (GAIASKY / "assets" / "shader" / "star.group.quad.fragment.glsl").read_text(encoding="utf-8")
    gs_vert = (GAIASKY / "assets" / "shader" / "star.group.quad.vertex.glsl").read_text(encoding="utf-8")

    # 4. L-lessons
    lessons = (ROOT / "tasks" / "lessons.md").read_text(encoding="utf-8")
    l14 = extract_section(lessons, r"^### L14\.", r"^### L15\.")
    l15 = extract_section(lessons, r"^### L15\.", r"^### L16\.")
    l17 = extract_section(lessons, r"^### L17\.", r"^## 2026-04-18 session")

    substitutions = {
        "__GIT_SHOW_PLACEHOLDER__": git_show,
        "__PLAN_EXCERPT_PLACEHOLDER__": plan_excerpt,
        "__GAIA_SKY_FRAGMENT_PLACEHOLDER__": gs_frag,
        "__GAIA_SKY_VERTEX_PLACEHOLDER__": gs_vert,
        "__L14_PLACEHOLDER__": l14,
        "__L15_PLACEHOLDER__": l15,
        "__L17_PLACEHOLDER__": l17,
    }

    for k, v in substitutions.items():
        prompt_text = prompt_text.replace(k, v)

    OUT.write_text(prompt_text, encoding="utf-8")
    print(f"wrote {OUT}")
    print(f"length: {len(prompt_text)} chars")

if __name__ == "__main__":
    main()
