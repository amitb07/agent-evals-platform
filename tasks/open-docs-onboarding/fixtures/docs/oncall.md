# On call

Alerts page the Ledgerline on-call engineer through PagerDuty.

| Alert | What to do |
| --- | --- |
| `invoice-queue-lag` (lag above 10 minutes) | Scale the worker: `ledgerctl scale worker=6`. Scale back to 2 once the lag is under 1 minute. |
| `pdf-render-5xx` | Almost always a `pdf-render` problem. Page the Docs team in `#docs-oncall`; do not restart our API. |
| `ledger-db-cpu` | Check slow queries on the dashboard. Never restart the database without the DBA on call. |

Open every incident in `#ledgerline-incidents`. A postmortem is due within 5 business days.
