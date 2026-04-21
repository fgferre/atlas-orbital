"""Build Codex θ.1b review context from placeholders."""

import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROMPT = ROOT / "tasks" / "codex-review-theta-1b-prompt.txt"
OUT = ROOT / "tasks" / "codex-review-theta-1b-context.txt"
GAIASKY = Path(os.environ.get("TEMP", "/tmp")) / "gaiasky"
if not GAIASKY.exists():
    GAIASKY = Path("/tmp/gaiasky")


def extract(text, start_re, end_re):
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
    text = PROMPT.read_text(encoding="utf-8")
    git_show = subprocess.check_output(
        ["git", "show", "22349b0"], cwd=ROOT, text=True, encoding="utf-8"
    )
    plan = (ROOT / "tasks" / "phase-gaia-sky.md").read_text(encoding="utf-8")
    plan_excerpt = extract(plan, r"^### θ\.1b ", r"^### θ\.1c ")
    gs_vertex = (GAIASKY / "assets" / "shader" / "star.group.quad.vertex.glsl").read_text(encoding="utf-8")
    gs_math = (GAIASKY / "assets" / "shader" / "lib" / "math.glsl").read_text(encoding="utf-8")
    gs_angles = (GAIASKY / "assets" / "shader" / "lib" / "angles.glsl").read_text(encoding="utf-8")

    lessons = (ROOT / "tasks" / "lessons.md").read_text(encoding="utf-8")
    l13 = extract(lessons, r"^### L13\.", r"^### L14\.")
    l14 = extract(lessons, r"^### L14\.", r"^### L15\.")
    l15 = extract(lessons, r"^### L15\.", r"^### L16\.")
    l17 = extract(lessons, r"^### L17\.", r"^## 2026-04-18 session")

    subs = {
        "__GIT_SHOW_PLACEHOLDER__": git_show,
        "__PLAN_EXCERPT_PLACEHOLDER__": plan_excerpt,
        "__GAIA_SKY_VERTEX_PLACEHOLDER__": gs_vertex,
        "__GAIA_SKY_MATH_PLACEHOLDER__": gs_math,
        "__GAIA_SKY_ANGLES_PLACEHOLDER__": gs_angles,
        "__L13_PLACEHOLDER__": l13,
        "__L14_PLACEHOLDER__": l14,
        "__L15_PLACEHOLDER__": l15,
        "__L17_PLACEHOLDER__": l17,
    }
    for k, v in subs.items():
        text = text.replace(k, v)

    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT}")
    print(f"length: {len(text)} chars")


if __name__ == "__main__":
    main()
