---
name: customer-data-cleanup
description: House standard for cleaning customer or lead exports (CSV or JSON) into clean/customers.csv plus clean/report.json. Use whenever you clean, deduplicate or normalise customer records.
version: 1.0.0
---

# Customer data cleanup standard

Follow every rule below exactly. Write a small Python script (standard library only: `csv`,
`json`, `datetime`) instead of editing rows by hand, run it, then check the invariants at the end.

## 1. Read the input

- Inputs are CSV (comma **or** semicolon delimited, may start with a UTF-8 BOM) or a JSON array of
  objects. When there are several input files, treat all their records as one list.
- Map column names case-insensitively, ignoring surrounding spaces:

| Standard column | Accepted input names |
| --- | --- |
| `id` | `id`, `customer_id`, `customer id` |
| `name` | `name`, `full_name`, `full name` |
| `email` | `email`, `e-mail`, `mail` |
| `phone` | `phone`, `telephone`, `mobile` |
| `country` | `country` |
| `updated_at` | `updated_at`, `last_updated`, `last updated`, `modified` |

- Drop every other column.

## 2. Normalise every record

- `id`: integer (strip spaces and leading zeros).
- `name`: trim, and collapse runs of whitespace into one space. Do not change letter case.
- `email`: trim and lower-case.
- `country`: ISO 3166 alpha-2, upper case, from this table (match case-insensitively):

| Code | Accepted values | Calling code |
| --- | --- | --- |
| `DE` | Germany, Deutschland, DE | 49 |
| `FR` | France, FR | 33 |
| `GB` | United Kingdom, UK, Great Britain, GB | 44 |
| `US` | United States, USA, US | 1 |
| `ES` | Spain, España, ES | 34 |
| `NL` | Netherlands, Holland, NL | 31 |
| `AT` | Austria, Österreich, AT | 43 |

- `phone`: E.164, e.g. `+4930123456`. Remove every character except digits and a leading `+`.
  Then: starts with `+` → keep; starts with `00` → replace `00` with `+`; starts with `0` → drop
  that `0` and prefix `+` and the country's calling code; otherwise prefix `+` and the calling
  code. An empty phone stays empty.
- `updated_at`: UTC, formatted `YYYY-MM-DDTHH:MM:SSZ`. Accepted inputs:
  - ISO 8601 with `Z` or an offset (`2026-03-05T14:22:00+01:00` → `2026-03-05T13:22:00Z`);
  - `YYYY-MM-DD HH:MM` and `DD.MM.YYYY HH:MM`, both already UTC (seconds `00`);
  - Unix epoch seconds (a 10-digit number).

## 3. Drop test records

After normalising, drop a record when **either**:

- its email domain is exactly `example.com`, `example.org` or `test.com`; or
- its name starts with `test ` (the word "test" followed by a space, any letter case).

Lookalikes are real customers: `tester@acme.de`, `Testarossa GmbH`, `contest@shop.fr` stay.

## 4. Merge duplicates

- Records with the same normalised email are duplicates. Records with an empty email are never
  merged.
- Keep the record with the latest `updated_at`; on a tie keep the one with the lowest `id`.
- If the kept record has an empty `phone` or `country`, take that field from the most recent
  duplicate that has it.

## 5. Write the output

`clean/customers.csv` (create `clean/`):

- header exactly `id,name,email,phone,country,updated_at`;
- comma delimiter, UTF-8 without BOM, `\n` line endings, quotes only where CSV needs them;
- one row per kept record, sorted by `id` ascending.

`clean/report.json`, exactly these four integer keys:

```json
{ "input_rows": 14, "test_rows_dropped": 2, "duplicates_merged": 3, "output_rows": 9 }
```

`input_rows` counts every record read from every input file; `duplicates_merged` counts the
records removed by merging (not the groups).

## 6. Check before you finish

- `input_rows == test_rows_dropped + duplicates_merged + output_rows`.
- Every phone matches `^\+[1-9][0-9]{6,14}$` or is empty; every timestamp ends in `Z`.
- No email appears twice; ids are strictly increasing.

## Example

Input `exports/customers.csv`:

```
id,name,email,phone,country,updated_at
7, Ana  Weber ,Ana.Weber@Acme.de,030 1234567,Germany,05.03.2026 14:22
3,Ana Weber,ana.weber@acme.de,,DE,2026-01-10 09:00
9,Test Account,qa@example.com,0170 000000,DE,2026-02-01 08:00
```

Output `clean/customers.csv`:

```
id,name,email,phone,country,updated_at
7,Ana Weber,ana.weber@acme.de,+49301234567,DE,2026-03-05T14:22:00Z
```

Report: `{"input_rows": 3, "test_rows_dropped": 1, "duplicates_merged": 1, "output_rows": 1}`.
