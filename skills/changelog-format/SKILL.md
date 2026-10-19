---
name: changelog-format
description: House format for CHANGELOG.md release entries. Use whenever you write or update a changelog or release entry from commits or pull requests.
version: 1.0.0
---

# House changelog format

Follow every rule below exactly whenever you write a release entry in `CHANGELOG.md`.

## File

- The changelog is `CHANGELOG.md` in the current directory. Create it if it is missing.
- Newest release first. Insert a new release above the existing ones and never edit older
  entries. The file has no title line or introduction: it starts with the newest release.

## Release heading

`## <version> — <YYYY-MM-DD>`, with an em dash (—) surrounded by single spaces. No `v` prefix,
no brackets, no links. Example: `## 2.7.0 — 2026-09-30`.

## Sections

Use only these sections, in this order, and only when they have at least one entry:

1. `### Breaking`
2. `### Added`
3. `### Fixed`
4. `### Performance`

Classify each change:

| Input | Section |
| --- | --- |
| commit type `feat`, or PR label `feature` | Added |
| commit type `fix`, or PR label `bug` | Fixed |
| commit type `perf`, or PR label `performance` | Performance |
| `!` after the commit type (`feat(api)!:`), a `BREAKING CHANGE:` note, or PR label `breaking` | Breaking (only there, not also in its other section) |
| commit types `chore`, `ci`, `test`, `refactor`, `docs`, `build`, `style`, or PR label `internal` | leave out |

Reverts: when a change in this release reverts another change in the same release, leave out
both of them.

## Entries

- One bullet per change: `- **<scope>**: <Description> (#<number>)`
- `<scope>` is the commit scope (`feat(search): …` → `search`) or, for pull requests, the
  `area:` label value. Use `general` when there is none.
- `<Description>` is the commit subject or PR title without the type prefix, scope and PR
  number, with the first letter in upper case and no trailing period.
- `<number>` is the pull request number.
- Inside a section, sort bullets alphabetically by scope; keep input order for equal scopes.

## Thanks line

End every release with a blank line and then `Thanks to <handles>.`, listing the distinct
authors of the changes that were included (not the left-out ones) as `@handle`, sorted
alphabetically and separated by `, `. Example: `Thanks to @ana, @li, @omar.`

## Example

Input commits:

```
a1 feat(search): add fuzzy matching (#412) @dana
a2 docs: fix typo in README (#413) @li
a3 fix(auth): handle expired tokens (#415) @omar
a4 feat(api)!: drop the v1 endpoints (#416) @dana
```

Output:

```markdown
## 2.7.0 — 2026-09-30

### Breaking

- **api**: Drop the v1 endpoints (#416)

### Added

- **search**: Add fuzzy matching (#412)

### Fixed

- **auth**: Handle expired tokens (#415)

Thanks to @dana, @omar.
```
