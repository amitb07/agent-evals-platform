"""Checks for the memory tasks: content is checked wherever the file is, preferences separately.

Usage: check_memory.py <check> <file name>   (exit 0 = pass)
"""
import csv
import io
import re
import sys
from pathlib import Path

EXPENSES = [
    ("05.03.2026", "Deutsche Bahn", "travel", 189.90),
    ("09.03.2026", "Hotel Adlon", "lodging", 1240.00),
    ("12.03.2026", "Lufthansa", "travel", 612.35),
    ("18.03.2026", "Café Einstein", "meals", 46.80),
    ("27.03.2026", "Staples", "office", 23.99),
]


def find(name):
    hits = sorted(p for p in Path(".").rglob(name) if p.is_file())
    if not hits:
        sys.exit(f"no file named {name}")
    return hits[0]


def amount(text):
    """Parses 1240.00, 1,240.00, 1.240,00 and 1.240,00 € alike."""
    s = re.sub(r"[^0-9,.\-]", "", text)
    if "," in s and s.rfind(",") > s.rfind("."):
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", "")
    return float(s)


def rows(path):
    text = path.read_text(encoding="utf-8-sig")
    first = text.splitlines()[0] if text.strip() else ""
    delim = max([";", ",", "\t"], key=first.count)
    return delim, list(csv.reader(io.StringIO(text), delimiter=delim))


def lines(path):
    return [l.strip() for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def fail_unless(ok, good, bad):
    if not ok:
        sys.exit(bad)
    print(good)


def main(check, name):
    path = find(name)
    text = path.read_text(encoding="utf-8")
    if check == "found":
        print(f"found {path}")
    elif check == "expense-rows":
        _, table = rows(path)
        data = [r for r in table[1:] if any(c.strip() for c in r)]
        got = sorted((r[1].strip(), round(amount(r[3]), 2)) for r in data if len(r) >= 4)
        want = sorted((v, a) for _, v, _, a in EXPENSES)
        fail_unless(got == want, "all five expenses with correct amounts", f"rows {got}, expected {want}")
    elif check == "semicolon":
        delim, table = rows(path)
        fail_unless(
            delim == ";" and all(len(r) == 4 for r in table if r),
            "semicolon-delimited with four columns",
            f"delimiter {delim!r}, expected ';'",
        )
    elif check == "expense-dates":
        _, table = rows(path)
        got = sorted(r[0].strip() for r in table[1:] if r)
        want = sorted(d for d, *_ in EXPENSES)
        fail_unless(got == want, "dates are DD.MM.YYYY", f"dates {got}, expected {want}")
    elif check == "open-count":
        fail_unless(re.search(r"\b4\b|\bfour\b", text, re.I), "mentions 4 open invoices", "the count of 4 open invoices is missing")
    elif check == "open-total":
        found = []
        for m in re.findall(r"\d[\d.,]*\d", text):
            try:
                found.append(amount(m))
            except ValueError:  # dates such as 15.09.2026
                pass
        fail_unless(any(abs(v - 11735.67) < 0.005 for v in found), "total outstanding 11735.67 is present", "the total outstanding 11735.67 is missing")
    elif check == "greeting":
        body = [l for l in lines(path) if not re.match(r"(to|from|cc|subject|betreff)\s*:", l, re.I)]
        fail_unless(body and body[0].startswith("Hallo Marco,"), "starts with 'Hallo Marco,'", f"first line is {body[:1]}")
    elif check == "signoff":
        fail_unless(lines(path)[-2:] == ["Viele Grüße", "Priya"], "ends with 'Viele Grüße' / 'Priya'", f"ends with {lines(path)[-2:]}")
    else:
        # `<check> = regex:<pattern>`: the pattern must occur in the file.
        pattern = check.removeprefix("regex:")
        fail_unless(re.search(pattern, text, re.M), f"found {pattern}", f"{pattern} not found in {path}")


main(sys.argv[1], sys.argv[2])
