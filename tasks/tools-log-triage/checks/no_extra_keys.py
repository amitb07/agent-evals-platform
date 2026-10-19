"""errors.json must list exactly the components that logged an ERROR entry."""
import json
import sys

keys = set(json.load(open("errors.json", encoding="utf-8")))
want = {"db", "auth", "payments", "search"}
if keys != want:
    sys.exit(f"keys {sorted(keys)}, expected {sorted(want)}")
print("exactly the four components with errors")
