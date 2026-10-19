def to_roman(n: int) -> str:
    """Convert an integer from 1 to 3999 to a Roman numeral, e.g. 1994 -> "MCMXCIV".

    Raise ValueError for anything outside 1..3999.
    """
    raise NotImplementedError


def from_roman(s: str) -> int:
    """Convert a canonical upper-case Roman numeral back to an integer, e.g. "MCMXCIV" -> 1994.

    Raise ValueError for an empty string or any non-canonical numeral (such as "IIII", "IC" or
    "MMMM").
    """
    raise NotImplementedError
