#!/bin/bash
set -euo pipefail
cd /app
python3 - <<'PY'
import json
p = "config/app.json"
cfg = json.load(open(p))
cfg["server"]["port"] = 8443
cfg["server"]["tls"] = {"enabled": True, "certPath": "/etc/certs/app.pem"}
del cfg["legacyMode"]
json.dump(cfg, open(p, "w"), indent=2)
PY
