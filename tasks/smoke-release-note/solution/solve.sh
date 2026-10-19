#!/bin/bash
set -euo pipefail
cd /app
cat > RELEASE.md <<'MD'
# Release 2.4

- Export reports to CSV from the reports page.
- Dark mode colours in the settings dialog are fixed.
- Search is about three times faster.
MD
