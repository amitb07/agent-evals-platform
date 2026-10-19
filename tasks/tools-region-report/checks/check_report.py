"""Checks report.md: a markdown table of total revenue per region, sorted descending.

Usage: check_report.py rows|sorted   (exit 0 = pass)
"""
import re
import sys

EXPECTED = {"north": 2150.75, "south": 2080.50, "east": 1790.35, "west": 1705.40}


def amount(text):
    """Parses 2150.75, 2,150.75, $2,150.75, 2.150,75 and 2.150,75 € alike."""
    s = re.sub(r"[^0-9,.\-]", "", text)
    if "," in s and s.rfind(",") > s.rfind("."):
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", "")
    return float(s) if s else None


def region_rows():
    rows = []
    for line in open("report.md", encoding="utf-8"):
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        name = re.sub(r"[*_`]", "", cells[0]).strip().lower()
        if name in EXPECTED and len(cells) >= 2:
            rows.append((name, amount(cells[-1])))
    return rows


def main(part):
    rows = region_rows()
    if part == "rows":
        got = dict(rows)
        bad = [r for r in EXPECTED if got.get(r) is None or abs(got[r] - EXPECTED[r]) > 0.01]
        if len(rows) != len(EXPECTED) or bad:
            sys.exit(f"wrong or missing totals for {bad or 'duplicate rows'}; got {got}")
        print("all four region totals are correct")
    elif part == "sorted":
        order = [name for name, _ in rows]
        want = sorted(EXPECTED, key=EXPECTED.get, reverse=True)
        if order != want:
            sys.exit(f"rows are in order {order}, expected {want}")
        print("rows are sorted by revenue, descending")


main(sys.argv[1])
