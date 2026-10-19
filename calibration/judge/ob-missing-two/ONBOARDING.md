# Ledgerline onboarding

## What it does
Ledgerline is our invoicing service: it creates invoices for orders, renders them as PDFs and
emails them. `ledger-api` (Node.js, 3 replicas) serves the REST API and owns the `ledger`
Postgres database; `ledger-worker` (2 replicas) reads the `invoice-events` Redis stream and sends
the emails. PDFs come from `pdf-render`, owned by the Docs team.

## Deploying
- Merges to `main` deploy to staging automatically (GitHub Actions).
- Production is manual with the `promote` workflow, only on Tuesdays and Thursdays before 15:00
  Berlin time.
- Migrations run first and must be backwards compatible.

## When you are paged
- `invoice-queue-lag`: `ledgerctl scale worker=6`, back to 2 when lag is under a minute.
- `pdf-render-5xx`: page the Docs team in `#docs-oncall`; don't restart our API.
- Open incidents in `#ledgerline-incidents`; postmortem within 5 business days.
