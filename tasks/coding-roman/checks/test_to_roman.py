import pytest
from roman import to_roman


@pytest.mark.parametrize(
    "n,s",
    [(1, "I"), (4, "IV"), (9, "IX"), (14, "XIV"), (40, "XL"), (90, "XC"), (400, "CD"),
     (944, "CMXLIV"), (1994, "MCMXCIV"), (2026, "MMXXVI"), (3999, "MMMCMXCIX")],
)
def test_values(n, s):
    assert to_roman(n) == s


@pytest.mark.parametrize("bad", [0, -1, 4000])
def test_out_of_range(bad):
    with pytest.raises(ValueError):
        to_roman(bad)
