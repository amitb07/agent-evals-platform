# Results: E1–E4

**Setup.** All runs took place on 2026-10-19 on the compose stack (Docker Desktop, Apple
silicon), with:

- Hermes v0.22.2 (pinned digest) and Harbor 0.24.0
- agent model `claude-sonnet-5`, judge model `claude-opus-5`
- 3 repeats per task and config, concurrency 4, pass threshold 0.8

E1–E3 each run 12 tasks × 2 configs × 3 repeats = 72 trials. E4 runs 8 tasks, so 48 trials.
Each experiment's design was committed before it ran (`experiments/*.yaml`; E1–E3 in commit
`950d6a5`). The demo seed contains all four experiments, so you can open every number and trial
below in the UI at `/trials/<id>`. The ids shown here are short prefixes.

## Summary

| | Change (A → B) | Verdict | Effect (B − A) | 95% CI | MDE | Agent spend | Time |
|---|---|---|---|---|---|---|---|
| **E1 skills** | no skill → `changelog-format` skill | Inconclusive | +0.203 | [−0.006, +0.439] | 0.317 | $2.24 | 20 min |
| **E2 tools** | `[terminal]` → `[terminal, file]` | Inconclusive (tool errors 28 → 14) | −0.017 | [−0.039, 0.000] | 0.034 | $2.72 | 19 min |
| **E3 memory** | memory off → memory seeded | Inconclusive (as recorded) | +0.151 | [−0.056, +0.389] | 0.332 | $2.43 | 17 min |
| E3, corrected grader | same | **Better** (sensitivity check, see below) | +0.193 | [+0.010, +0.407] | 0.291 | | |
| **E4 cleanup skill** (showcase) | no skill → `customer-data-cleanup` skill | **Better** | **+0.442** | **[+0.223, +0.650]** | 0.330 | $7.38 | 70 min |

None of the 264 trials was excluded, and there were no infrastructure failures.

**In short:** the skill (E1) and the seeded memory (E3) do exactly what they should on the tasks
that need them. B scores 1.00 on each of those tasks in every repeat, including the held-out
ones, and nothing changes on the other tasks.

However, the measure we committed to is the average difference over **all 12 tasks**. Each
change affects only 3 of them, so the overall effect shrinks to about 0.2. Because scores vary a
lot between tasks, the confidence interval still reaches zero (MDE ≈ 0.32).

The file toolset (E2) makes no difference, because the shell already handles every task.

![E1 Compare screen](screenshots/e1-compare.png)

## E4: customer data cleanup skill (showcase)

**Why a fourth experiment.** E1 and E3 showed the skill and the memory working on their target
tasks, but the 12-task average watered the effect down. E4 was designed so that most of the
suite consists of the skill's own tasks.

It tests a second skill, `skills/customer-data-cleanup`. The skill is a house standard for
cleaning customer exports: column mapping, E.164 phone numbers, ISO country codes, UTC
timestamps, removing test accounts, a rule for merging duplicates, and a fixed report format.
The skill was committed before its tasks were written (commit `9e90965`).

**Hypothesis** (committed in `experiments/e4-cleanup-skill-v2.yaml`): *B scores higher than A on
the six cleanup tasks, including the two held-out ones, and the same on the two control tasks.
With eight tasks, the suite-level effect is positive with a 95% CI above 0.*

![E4 Compare screen](screenshots/e4-compare.png)

| Task | A | B | Δ |
|---|---|---|---|
| cleanup-basic | 0.77 | 1.00 | +0.23 |
| cleanup-duplicates | 0.40 | 1.00 | +0.60 |
| cleanup-test-accounts | 0.40 | 1.00 | +0.60 |
| cleanup-semicolon-export | 0.43 | 1.00 | +0.57 |
| cleanup-two-exports (held out) | 0.05 | 1.00 | +0.95 |
| cleanup-json-leads (held out) | 0.42 | 1.00 | +0.58 |
| tools-region-report (control) | 1.00 | 1.00 | 0.00 |
| coding-roman (control) | 1.00 | 1.00 | 0.00 |

| Part of the hypothesis | Outcome |
|---|---|
| B higher on all six cleanup tasks, held-out included | ✅ B scored 1.00 in all 18 cleanup trials |
| Controls unchanged | ✅ both 1.00 in both arms |
| Suite-level CI above 0 | ✅ **Better**, +0.442 [+0.223, +0.650]; two-stage [+0.223, +0.652] |

**Per arm (A → B):**

- pass@1: 33% → **100%** (B passed 24 of 24 trials)
- cost per trial: $0.183 → $0.125
- cost per pass: $0.549 → $0.125
- failed tool calls: 32 → 7
- median agent time on cleanup tasks: 156 s → 95 s

Total trial time is not a fair comparison here: one B trial waited 41 minutes in Harbor's
verifier phase. That was an infrastructure delay, not the agent.

**Why A fails.** Without the standard, Hermes writes a careful cleanup, but a different one.
Failed checks over A's 18 cleanup trials:

- **Report format** (18 of 18): it makes up its own report keys.
- **Kept records** (14): it merges duplicates by its own rule. It keeps the older record (ids
  201/203 instead of 209/211), or it merges two customers without an email by name, which the
  standard does not allow.
- **Timestamps** (13): it writes `+00:00` instead of `Z`, or uses a non-standard column name.
- **Phones** (10): it takes the number from the wrong duplicate.
- **Header** (9): it keeps the input column names (`customer_id`, `full_name`) or adds extra
  columns.
- In the held-out two-export task, it also created new ids (`CUST-0001`…) and kept the original
  ids in extra columns.

**Robustness check.** The content checks match rows by `id`. So on `cleanup-two-exports`, A's
new ids also gave it 0 on the email, phone, country and timestamp checks. We re-graded those
three trials, matching rows by email instead. A then scores 0.50, 0.35 and 0.50, and
`pnpm rescore` gives **Better, +0.392 [+0.208, +0.546]**. So the verdict does not depend on
this choice.

**Why v1 was stopped.** The first run (`e4-cleanup-skill`) was stopped after 12 of 48 trials
($1.59). Its content checks only read the standard column names. A baseline that kept
`customer_id` therefore got 0 even when its content was correct (0.05 instead of 0.40–0.50 on
two tasks). The checks now accept the standard's column aliases, and only the `format` check
requires the exact header. Nothing else in the design changed, and it was committed again as v2
before it ran. v1 stays in the database as a stopped run and is not in the demo seed.

## How to read the numbers

- **Effect** = the average over tasks of (B's mean score − A's mean score). Scores range from 0
  to 1, after gates are applied.
- **95% CI** = a percentile bootstrap over tasks, with 10,000 draws and the experiment's seed. A
  two-stage bootstrap (tasks, then repeats) is shown as a sensitivity check. It agrees with the
  main result in every experiment.
- **Better / Worse** needs the CI to exclude 0 *and* at least 6 paired tasks.
- **MDE** = the smallest effect we could reliably detect, at 95% confidence and 80% power. It is
  computed after the run from how much the task differences vary.
- The CI describes **this suite only**, not Hermes in general.

## E1: changelog skill (headline)

**Hypothesis** (committed before the run): *B scores higher on the three skill tasks, including
the held-out PR-based task, and the same on the other nine. The suite-level effect is positive
with a 95% CI above 0.*

| Task | Category | A | B | Δ |
|---|---|---|---|---|
| skill-changelog-release | skill | 0.03 | 1.00 | **+0.97** |
| skill-changelog-breaking | skill | 0.42 | 1.00 | **+0.58** |
| skill-changelog-prs (held out) | skill | 0.05 | 1.00 | **+0.95** |
| memory-invoice-summary | memory | 0.45 | 0.38 | −0.07 |
| the other 8 tasks | tools, coding, memory, open | same | same | 0.00 |

| Part of the hypothesis | Outcome |
|---|---|
| B higher on all three skill tasks, held-out included | ✅ in every repeat, 9 of 9 pairs |
| Unchanged elsewhere | ✅ the largest other change is 0.07 (one task, within normal repeat noise) |
| Suite-level CI above 0 | ❌ lower bound −0.006 |

**Per arm (A → B):** pass@1 0.50 → 0.75; cost per passing trial $0.072 → $0.035; tool errors
15 → 10. On the skill tasks alone, B is also cheaper and faster ($0.027 vs $0.076, and 49 s vs
81 s per trial), because it does not search the filesystem for a format to follow.

**Why A fails the skill tasks** (as seen in Run detail). Without the skill, Hermes writes a
reasonable but generic changelog. It:

- makes up section names ("Breaking Changes", "Features", "Bug Fixes", "Documentation");
- lists internal commits (docs, refactor, CI);
- uses its own bullet style and heading;
- leaves out the thanks line.

In one repeat (`b0af2019`), it searched for an existing changelog or style guide, found none, and
asked for an example instead of writing anything.

A scores higher on `skill-changelog-breaking` (0.42) because that task includes an older entry in
the house format, which A partly copies.

## E2: file toolset

**Hypothesis:** *B scores at least as high as A, with fewer tool errors on the file-editing
tasks. A small effect is expected, so Inconclusive is a likely and acceptable outcome.*

Every task has the same mean in both arms, except two:

- `skill-changelog-breaking`: 0.53 vs 0.47, flagged as flaky (its repeats differ by more than
  0.25).
- `memory-expenses-csv`: 0.13 vs 0.00. In one A repeat, Hermes wrote the CSV to the root folder
  instead of asking where to save it.

The effect is −0.017, CI [−0.039, 0.000]: no measurable difference in score, as expected. With
only `[terminal]`, Hermes does all its file work through the terminal tool (137 terminal calls)
and succeeds just as often.

The tool-error part of the hypothesis holds: **failed tool calls drop by half with the file
toolset (28 → 14)**. Tool errors are reported but are not part of the verdict.

## E3: seeded memory

**Hypothesis:** *B scores higher on the three memory tasks, including the held-out email task,
and the same on the other nine. The suite-level effect is positive with a 95% CI above 0.*

| Task | A | B (recorded) | B (corrected grader) |
|---|---|---|---|
| memory-expenses-csv | 0.00 | 1.00 | 1.00 |
| memory-invoice-summary | 0.45 | 1.00 | 1.00 |
| memory-vendor-email (held out) | 0.25 | 1.00 | 1.00 |
| tools-region-report | 1.00 | **0.50** | 1.00 |
| the other 8 tasks | — | Δ within ±0.08 | same |

**Why A fails the memory tasks.** Without memory, Hermes does not know where "my reports" go.

- On `memory-expenses-csv` it **asks** instead of writing the file. In a one-shot run nobody can
  answer, so there is no output and the score is 0.
- On the other tasks it writes the file in the root folder, uses English number and date
  formats, and writes a "Dear Marco … Best regards" email.

With memory, it follows every preference: the `reports/` folder, `;` as the CSV separator,
`11.735,67 €`, `15.09.2026`, and "Hallo Marco … Viele Grüße / Priya".

### A grader bug found in E3, and the corrected result

With memory on, Hermes also used the user's German number format in the unrelated
`tools-region-report` task (`| north | 2.150,75 € |`). That task's checker removed the commas and
read the number as 2.15. As a result, all three memory-arm trials lost 0.5 on a correct answer.
This was clearly a grader bug, because the prompt does not ask for any number format.

What we did:

- The checker now understands both formats. It uses the same parser as the memory checkers.
- We re-graded **all 18** `tools-region-report` trials of E1–E3 with the fixed checker. Only
  those 3 trials changed (0.5 → 1.0). Log: `results-data/e1-e3-region-report-regrade.txt`.
- The database keeps the original scores. The corrected result comes from
  `pnpm rescore <experiment> <trial>=<score>…`, which recomputes the statistics with the same
  code and seed. Without any replaced scores, it reproduces the recorded numbers exactly.
- **Corrected E3: Better, effect +0.193, CI [+0.010, +0.407].** The fix was made after seeing the
  data, so please treat this as a disclosed sensitivity result, not as the planned verdict.

The bug is also a finding in itself: memory changes the agent's behaviour **beyond** the tasks it
was seeded for. Here the change was harmless, but a strict grader counted it as a failure.

## What would make E1 and E3 conclusive

The effects are large and consistent where they apply. The limit is what we chose to measure.
Each option below needs a new experiment, committed before it runs, not a new analysis of the
old data:

1. Make the target category the main measure. 3 tasks × 3 repeats is still below the 6-task
   minimum, so this means adding skill or memory tasks (about 6–8 per factor).
2. Keep the whole-suite measure but use more tasks. The MDE shrinks with √n.
3. Report the target-category difference as a planned secondary result.

## Judge agreement

- **Calibration:** on 12 test cases (2 real, 10 crafted, including 2 injection attempts), all
  24 of 24 judge verdicts match the labels, with no score error. Details and caveats are in
  `judge-calibration.md`.
- **Real runs:** the judge graded the 18 `open-docs-onboarding` trials, and all scored 1.0. We
  read one sample by hand (`791bb47d`: all seven facts, 235 words) and agree. Sonnet 5 already
  scores the maximum on this task, so it does not tell the configs apart.
- The judge and the code checks cannot disagree in E1–E3. The only judged task has no matching
  code check except the word count, which passed in all 18 trials.

## Transcripts

We picked transcripts by a fixed rule set in the plan: every A/B disagreement, every excluded
trial, every case where the judge and the code checks disagree, plus 2 agreements per experiment
(the two with the lowest A-trial id). There were no exclusions and no judge/code disagreements.

A "disagreement" means one arm passed and the other did not, on the same task and repeat. Each
"why" below comes from the failed checks' own messages, as shown in Run detail.

### E1 (9 disagreements)

| Task, repeat | A | B | Why A failed |
|---|---|---|---|
| skill-changelog-breaking, 1 | 0.30 `e57cc301` | 1.00 `3914735a` | Sections "Breaking Changes" and "Documentation"; docs commit #512 listed; no thanks line |
| skill-changelog-breaking, 2 | 0.30 `3c77200b` | 1.00 `4c2ebb66` | Breaking change filed under Added; "Documentation" section; no thanks line |
| skill-changelog-breaking, 3 | 0.65 `52f95321` | 1.00 `3e9e330a` | "Breaking Changes" heading; #501 in two sections; bullet text taken from the footer |
| skill-changelog-prs, 1–3 | 0.05 `883fc10a` `ef12b947` `1737579d` | 1.00 `8fb9bdb1` `9a6aaaae` `fb5cb6c2` | Wrong heading; internal PR #603 listed; "Features"/"Bug Fixes" sections; author in each bullet |
| skill-changelog-release, 1 | 0.00 `b0af2019` | 1.00 `8ad9554e` | No CHANGELOG.md written; asked for an example of the house format |
| skill-changelog-release, 2–3 | 0.05 `c8849fed` `55c59bb9` | 1.00 `b4c0afe5` `bbddb5a6` | Internal commits #413 #416 #420 #422 listed; wrong heading and sections |
| agreement: memory-invoice-summary, 1 | 0.45 `09490ad2` | 0.45 `98c011de` | Neither arm has memory: English formats, file in root |
| agreement: coding-fix-slugify, 3 | 1.00 `135d6dcf` | 1.00 `04575cd2` | Both pass |

### E2 (1 disagreement)

| Task, repeat | A | B | Why |
|---|---|---|---|
| skill-changelog-breaking, 1 | 0.65 `a039308d` | 0.80 `ea18a615` | A put #501 under "Removed" and missed that #511 is breaking; B passed at exactly 0.80 |
| agreement: memory-expenses-csv, 2 | 0.40 `0d4fb160` | 0.00 `e4c72c72` | Both fail: A wrote a comma CSV in the root, B asked where to save it |
| agreement: skill-changelog-prs, 2 | 0.05 `128899b6` | 0.05 `0704d386` | Both fail without the skill |

### E3 (12 disagreements)

| Task, repeat | A | B | Why |
|---|---|---|---|
| memory-expenses-csv, 1–3 | 0.00 `16ab7230` `16fadb20` `31e96922` | 1.00 `25023a67` `02035713` `b473d0ab` | A asked where to save and wrote nothing |
| memory-invoice-summary, 1–3 | 0.45 `c8cc098e` `2b6be888` `12d17a82` | 1.00 `0545e475` `ad959417` `14be32ca` | A: file in root, total `11,735.67`, date `2026-09-15` |
| memory-vendor-email, 1–3 | 0.25 `dbdb804c` `6729a4a0` `f513857a` | 1.00 `bbe8fd35` `43abf204` `a204a301` | A: "Dear/Hi Marco", "Best regards", English amount and date |
| tools-region-report, 1–3 | 1.00 `aebd91f9` `03f5a45e` `bd1e26d8` | 0.50 `826ee835` `24353d8f` `69ffb903` | Grader bug: B's German amounts were misread (see above) |
| agreement: coding-fix-slugify, 2 | 1.00 `1e085b35` | 1.00 `bd37d8f8` | Both pass |
| agreement: coding-roman, 2 | 1.00 `31e6c1c4` | 1.00 `8eee42ab` | Both pass |

## Reproduce

```sh
docker compose up                        # demo: the seed loads E1–E4 into an empty database
# with ANTHROPIC_API_KEY in .env, open an experiment in the UI and press Run, or:
curl -X POST localhost:3000/api/v1/experiments/<id>/run
pnpm rescore <experiment-id> <trial-id>=<score> ...   # sensitivity analysis, nothing written
```

The raw statistics, as served by the API, are in `results-data/e1-skills-stats.json`,
`e2-tools-stats.json`, `e3-memory-stats.json` and `e4-cleanup-skill-v2-stats.json`.
