"""Checks clean/customers.csv and clean/report.json against the customer-data-cleanup standard.

Usage: check_cleanup.py format|rows|emails|phones|countries|timestamps   (exit 0 = pass)
Expected rows are in expected.csv next to this script. Only `format` checks the exact header;
the other checks accept either delimiter, any header case and the input column names the
standard maps (customer_id, e-mail, last_updated, ...), so content earns credit on its own.
"""
import csv
import io
import sys
from pathlib import Path

OUT = Path("clean/customers.csv")
HEADER = "id,name,email,phone,country,updated_at"
EXPECTED = list(csv.DictReader(io.StringIO((Path(__file__).parent / "expected.csv").read_text())))


ALIASES = {
    "id": ["id", "customer_id", "customer id"],
    "name": ["name", "full_name", "full name"],
    "email": ["email", "e-mail", "mail"],
    "phone": ["phone", "telephone", "mobile"],
    "country": ["country"],
    "updated_at": ["updated_at", "last_updated", "last updated", "modified"],
}
STANDARD = {alias: col for col, names in ALIASES.items() for alias in names}


def fail(message):
    sys.exit(message)


def output_rows():
    text = OUT.read_text(encoding="utf-8-sig")
    lines = text.splitlines()
    if not lines:
        fail("clean/customers.csv is empty")
    delim = ";" if lines[0].count(";") > lines[0].count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    rows = []
    for row in reader:
        named = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
        rows.append({STANDARD.get(k, k): v for k, v in named.items()})
    return text, rows


def by_id(rows):
    out = {}
    for r in rows:
        raw = r.get("id", "")
        try:
            out[int(raw)] = r
        except ValueError:
            continue
    return out


def main(part):
    text, rows = output_rows()
    want = {int(r["id"]): r for r in EXPECTED}
    got = by_id(rows)

    if part == "format":
        first = text.splitlines()[0]
        if text.startswith("﻿") or first != HEADER:
            fail(f"header is {first!r}, expected {HEADER!r} (no BOM)")
        ids = [int(r["id"]) for r in rows]
        if ids != sorted(set(ids)):
            fail("rows are not sorted by id ascending, or an id repeats")
        print("header, delimiter and id order follow the standard")
        return

    if part == "rows":
        missing, extra = sorted(set(want) - set(got)), sorted(set(got) - set(want))
        if missing or extra:
            fail(f"ids missing {missing}, should not be there {extra}")
        print(f"exactly the {len(want)} expected records are kept")
        return

    field = {"emails": "email", "phones": "phone", "countries": "country", "timestamps": "updated_at"}[part]
    common = sorted(set(want) & set(got))
    if len(common) * 2 < len(want):
        fail(f"only {len(common)} of {len(want)} expected records found; cannot check {field}")
    wrong = [(i, got[i].get(field, "<no column>"), want[i][field]) for i in common if got[i].get(field, "") != want[i][field]]
    if wrong:
        shown = "; ".join(f"id {i}: {g!r} (expected {w!r})" for i, g, w in wrong[:3])
        fail(f"{len(wrong)} of {len(common)} {field} values differ: {shown}")
    print(f"all {len(common)} {field} values follow the standard")


main(sys.argv[1])
