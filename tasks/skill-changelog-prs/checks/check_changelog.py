"""Checks one release entry in CHANGELOG.md against the house format (skills/changelog-format).

Usage: check_changelog.py entries|sections|bullets|preserved   (exit 0 = pass)
Expected values come from expected.json next to this script.
"""
import json
import re
import sys
from pathlib import Path

EXPECTED = json.loads((Path(__file__).parent / "expected.json").read_text(encoding="utf-8"))
VERSION = EXPECTED["version"]


def release_block(lines):
    """Lines of the release whose heading mentions VERSION, up to the next release heading."""
    start = next(
        (i for i, l in enumerate(lines) if l.startswith("#") and VERSION in l and not l.startswith("###")),
        None,
    )
    if start is None:
        sys.exit(f"no heading for release {VERSION}")
    end = next(
        (j for j in range(start + 1, len(lines)) if re.match(r"#{1,2} ", lines[j])),
        len(lines),
    )
    return start, lines[start:end]


def prs(text):
    return sorted({int(n) for n in re.findall(r"#(\d+)", text)})


def main(part):
    lines = Path("CHANGELOG.md").read_text(encoding="utf-8").splitlines()
    start, block = release_block(lines)
    sections = EXPECTED["sections"]  # [[name, [bullet, ...]], ...]
    want_prs = sorted(n for _, bullets in sections for b in bullets for n in prs(b))

    if part == "entries":
        got = prs("\n".join(block[1:]))
        if got != want_prs:
            missing = sorted(set(want_prs) - set(got))
            extra = sorted(set(got) - set(want_prs))
            sys.exit(f"missing {missing}, should be left out {extra}")
        print(f"exactly the {len(want_prs)} expected changes are listed")

    elif part == "sections":
        got, current = [], None
        for line in block[1:]:
            if line.startswith("### "):
                current = [line[4:].strip(), []]
                got.append(current)
            elif current is not None:
                current[1].extend(prs(line))
        want = [[name, sorted(n for b in bullets for n in prs(b))] for name, bullets in sections]
        got = [[name, sorted(ns)] for name, ns in got]
        if got != want:
            sys.exit(f"sections {got}, expected {want}")
        print("sections, their order and their changes match")

    elif part == "bullets":
        got = [l.rstrip() for l in block if l.startswith("- ")]
        want = [b for _, bullets in sections for b in bullets]
        if got != want:
            wrong = [g for g in got if g not in want][:3]
            sys.exit(f"bullets differ from the house format, e.g. {wrong or 'order'}")
        print("every bullet is in the house format and order")

    elif part == "preserved":
        older = EXPECTED["preservedOlder"]
        rest = "\n".join(lines[start + len(block):]).strip()
        if start != 0 or not lines[0].startswith("## "):
            sys.exit("the new release is not at the top of the file")
        if rest != older.strip():
            sys.exit("the older releases were changed or are not below the new release")
        print("new release is on top and older releases are unchanged")


main(sys.argv[1])
