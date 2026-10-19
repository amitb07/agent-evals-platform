#!/bin/bash
set -euo pipefail
cd /app
cat > report.md <<'MD'
# Revenue by region

| Region | Revenue |
| --- | ---: |
| north | 2150.75 |
| south | 2080.50 |
| east | 1790.35 |
| west | 1705.40 |
MD
