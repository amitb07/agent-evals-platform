#!/bin/bash
set -euo pipefail
cd /app
cat > SUMMARY.md <<'MD'
# Billing sync, 14 October

## Decisions
- Default invoice due date goes from 30 to 14 days from the November cycle.
- Paper invoices are dropped at the end of the year.
- Kranich Digital becomes the PDF vendor.

## Action items
- Ana: update the due-date default and the customer email template by 21 October.
- Omar: write the paper-invoice sunset notice.
- Li: sign the Kranich Digital contract.
- Sam: migrate the PDF templates to the new vendor.
MD
