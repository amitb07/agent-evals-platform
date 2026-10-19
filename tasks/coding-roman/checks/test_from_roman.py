import pytest
from roman import from_roman


@pytest.mark.parametrize(
    "s,n", [("I", 1), ("IV", 4), ("XLII", 42), ("CDXLIV", 444), ("MMMCMXCIX", 3999)]
)
def test_values(s, n):
    assert from_roman(s) == n


def test_round_trip_all():
    from roman import to_roman

    assert all(from_roman(to_roman(i)) == i for i in range(1, 4000))


@pytest.mark.parametrize("bad", ["", "IIII", "IC", "MMMM", "VX", "ABC", "iv", "XLX"])
def test_invalid(bad):
    with pytest.raises(ValueError):
        from_roman(bad)
