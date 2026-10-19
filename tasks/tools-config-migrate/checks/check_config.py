"""Checks config/app.json after the migration.

Usage: check_config.py changes|preserved   (exit 0 = pass)
"""
import json
import sys

ORIGINAL_UNTOUCHED = {
    "name": "ledgerline",
    "database": {"url": "postgres://ledger@db:5432/ledger", "poolSize": 10},
    "features": {"csvExport": True, "darkMode": False},
    "logLevel": "info",
}

cfg = json.load(open("config/app.json", encoding="utf-8"))
server = cfg.get("server", {})
part = sys.argv[1]
if part == "changes":
    problems = []
    if server.get("port") != 8443:
        problems.append(f"server.port is {server.get('port')!r}")
    if server.get("tls") != {"enabled": True, "certPath": "/etc/certs/app.pem"}:
        problems.append(f"server.tls is {server.get('tls')!r}")
    if "legacyMode" in cfg:
        problems.append("legacyMode is still present")
    if problems:
        sys.exit("; ".join(problems))
    print("port, tls and legacyMode changes applied")
elif part == "preserved":
    problems = [k for k, v in ORIGINAL_UNTOUCHED.items() if cfg.get(k) != v]
    if server.get("host") != "0.0.0.0" or server.get("timeouts") != {"readMs": 5000, "writeMs": 5000}:
        problems.append("server.host/timeouts")
    extra = set(cfg) - set(ORIGINAL_UNTOUCHED) - {"server"}
    if extra:
        problems.append(f"unexpected keys {sorted(extra)}")
    if problems:
        sys.exit(f"changed or missing: {problems}")
    print("all other settings are unchanged")
