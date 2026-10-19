#!/bin/bash
set -euo pipefail
cd /app
mkdir -p reports
cat > reports/expenses.csv <<'CSV'
date;vendor;category;amount
05.03.2026;Deutsche Bahn;travel;189,90
09.03.2026;Hotel Adlon;lodging;1240,00
12.03.2026;Lufthansa;travel;612,35
18.03.2026;Café Einstein;meals;46,80
27.03.2026;Staples;office;23,99
CSV
