#!/bin/bash
set -euo pipefail
cd /app
printf '{"db": 4, "auth": 3, "payments": 2, "search": 1}\n' > errors.json
