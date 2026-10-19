# Ledgerline

- Invoicing service: creates invoices, renders PDFs, emails them.
- Merge to main = auto deploy to staging.
- Prod: manual `promote` workflow, Tue/Thu only.
- Rollback: `ledgerctl rollback <release-tag>`.
- Queue lag alert: `ledgerctl scale worker=6`.
- pdf-render errors: Docs team, #docs-oncall.
- Never restart the DB without the DBA.
