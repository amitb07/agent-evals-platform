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
