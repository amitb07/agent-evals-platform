# Ledgerline architecture

Ledgerline is the invoicing service. It creates invoices for customer orders, renders them as
PDFs and emails them to customers.

- `ledger-api` (Node.js) serves the REST API and owns the Postgres database `ledger`.
- `ledger-worker` consumes the `invoice-events` Redis stream and sends invoice emails.
- PDFs are rendered by `pdf-render`, a separate service owned by the Docs team. Ledgerline calls
  it over HTTP and retries three times.

The API is stateless and runs 3 replicas; the worker runs 2 replicas by default.
