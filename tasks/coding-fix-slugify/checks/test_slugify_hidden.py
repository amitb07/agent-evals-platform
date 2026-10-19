from textutil.slugify import slugify


def test_docstring_examples():
    assert slugify("Hello, World!") == "hello-world"
    assert slugify("  Crème brûlée -- recipe ") == "creme-brulee-recipe"


def test_collapses_and_trims_separators():
    assert slugify("a  --  b") == "a-b"
    assert slugify("---x---") == "x"


def test_accents_become_ascii():
    assert slugify("Ångström Über Café") == "angstrom-uber-cafe"


def test_drops_non_latin_symbols():
    assert slugify("Price: 5€ / 10¥") == "price-5-10"


def test_digits_and_empty():
    assert slugify("Release 2.4.1") == "release-2-4-1"
    assert slugify("!!!") == ""
    assert slugify("") == ""
