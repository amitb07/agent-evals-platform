#!/bin/bash
set -euo pipefail
cd /app
cat > textutil/slugify.py <<'PY'
import re
import unicodedata


def slugify(text: str) -> str:
    """Turn a title into a URL slug: lower case ASCII words joined by single hyphens.

    slugify("Hello, World!") == "hello-world"
    slugify("  Crème brûlée -- recipe ") == "creme-brulee-recipe"
    """
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
PY
