#!/bin/bash
set -euo pipefail
cd /app
cat > email-draft.txt <<'TXT'
Subject: Overdue invoice NW-2291

Hallo Marco,

a quick reminder that invoice NW-2291 over 4.180,00 € was due on 15.09.2026 and is still open.
Could you let me know when we can expect the payment?

Viele Grüße
Priya
TXT
