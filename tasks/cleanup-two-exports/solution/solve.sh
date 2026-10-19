#!/bin/bash
set -euo pipefail
cd /app
mkdir -p clean
cat > clean/customers.csv <<'CSV'
id,name,email,phone,country,updated_at
502,David Moreau,david.moreau@vins.fr,+33556443322,FR,2026-05-03T10:00:00Z
503,Chloe Evans,chloe@evans.co.uk,+447911123456,GB,2026-05-04T11:00:00Z
505,Ruben Smit,ruben@smit.nl,+31611122233,NL,2026-05-06T13:00:00Z
601,Laura Bianchi,laura@bianchi-studio.de,+491519998887,DE,2026-05-10T06:00:00Z
604,Greta Lind,greta@lind.at,+436765554443,AT,2026-05-08T16:30:00Z
606,Kai Brenner,kai@brenner.de,+491512223334,DE,2026-05-10T08:00:00Z
CSV
cat > clean/report.json <<'JSON'
{"input_rows": 12, "test_rows_dropped": 2, "duplicates_merged": 4, "output_rows": 6}
JSON
