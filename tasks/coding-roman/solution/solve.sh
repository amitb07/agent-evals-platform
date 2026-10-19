#!/bin/bash
set -euo pipefail
cd /app
cat > roman.py <<'PY'
_PAIRS = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"),
          (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]


def to_roman(n: int) -> str:
    """Convert an integer from 1 to 3999 to a Roman numeral, e.g. 1994 -> "MCMXCIV"."""
    if not isinstance(n, int) or not 1 <= n <= 3999:
        raise ValueError(f"out of range: {n!r}")
    out = []
    for value, sym in _PAIRS:
        count, n = divmod(n, value)
        out.append(sym * count)
    return "".join(out)


_TABLE = {to_roman(i): i for i in range(1, 4000)}


def from_roman(s: str) -> int:
    """Convert a canonical upper-case Roman numeral back to an integer."""
    if s not in _TABLE:
        raise ValueError(f"not a canonical Roman numeral: {s!r}")
    return _TABLE[s]
PY
