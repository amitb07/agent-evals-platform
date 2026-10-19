def slugify(text: str) -> str:
    """Turn a title into a URL slug: lower case ASCII words joined by single hyphens.

    slugify("Hello, World!") == "hello-world"
    slugify("  Crème brûlée -- recipe ") == "creme-brulee-recipe"
    """
    out = []
    for ch in text.lower():
        if ch.isalnum():
            out.append(ch)
        else:
            out.append("-")
    return "".join(out)
