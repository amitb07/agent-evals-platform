#!/bin/bash
set -euo pipefail
cd /app
cat > CHANGELOG.md <<'MD'
## 4.0.0 — 2026-10-17

### Breaking

- **api**: Remove the deprecated /v1 endpoints (#501)
- **billing**: Round VAT per line, not per invoice (#511)

### Added

- **webhooks**: Sign payloads with HMAC-SHA256 (#503)

### Fixed

- **auth**: Reject tokens issued in the future (#508)
- **export**: Escape quotes in CSV cells (#504)

### Performance

- **reports**: Stream large exports (#510)

Thanks to @ana, @li, @omar, @sam.

## 3.2.0 — 2026-10-15

### Added

- **export**: Add CSV export to the reports page (#418)
- **search**: Add fuzzy matching for customer names (#412)

### Fixed

- **auth**: Refresh expired sessions instead of logging out (#415)
- **general**: Correct the copyright year in the footer (#423)
- **reports**: Show totals for empty months (#421)

### Performance

- **search**: Cache the tokenizer between queries (#419)

Thanks to @ana, @dana, @li, @omar, @sam.
MD
