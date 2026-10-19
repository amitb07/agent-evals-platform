#!/bin/bash
set -euo pipefail
cd /app
mkdir -p reports
cat > reports/open-invoices.md <<'MD'
# Open invoices

- Open invoices: 4
- Total outstanding: 11.735,67 €
- Oldest due date: 15.09.2026 (NW-2291, Nordwind Logistics)
MD
