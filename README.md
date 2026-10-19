# Agent Evals on Hermes

An A/B testing platform for [Hermes Agent](https://github.com/NousResearch/hermes-agent).
Change one thing in the agent (a skill, a toolset, its memory or the model), run the same tasks
under the baseline (A) and the candidate (B) several times each, and get
**Better / Worse / Inconclusive** with a 95% confidence interval. Open any run to see why it
passed or failed: the transcript, the files the agent changed and every grader's reason.

NestJS (API + worker) · Vue 3 + TypeScript · Postgres · Docker · [Harbor](https://github.com/harbor-framework/harbor) as the trial runner.

![Compare screen](docs/screenshots/e1-compare.png)

## Quick start (demo, no API key)

Requirements: Docker Desktop (tested on macOS, Apple silicon) with about 15 GB free; the pinned
Hermes image alone is 4.5 GB.

```sh
docker compose up
```

Open <http://localhost:8080>. The first build takes several minutes. On first start the API
loads a demo seed with four finished experiments (264 real trials), so every screen works
without an API key:

- **Experiments**: list, progress, spend; **New experiment** form; **New skill config**.
- **Compare**: verdict, effect, 95% CI, MDE, per-task deltas, score vs. cost, pass@k by arm.
- **Run detail**: outcome in one line, transcript (tool calls, arguments, outputs), grades with
  reasons, A vs. B on the same task, workspace diff and files.

Health check: <http://localhost:3000/api/v1/health>.

## Results

Four pre-registered experiments, Sonnet 5 agent, Opus 5 judge, $14.8 of agent spend in total
([full write-up](docs/results.md)):

| Experiment | Change | Verdict | Effect [95% CI] |
|---|---|---|---|
| E1 skills | + changelog-format skill | Inconclusive | +0.20 [−0.01, +0.44] |
| E2 tools | + file toolset | Inconclusive (tool errors 28 → 14) | −0.02 [−0.04, 0.00] |
| E3 memory | seeded user preferences | Inconclusive; **Better** after a disclosed grader fix | +0.15 [−0.06, +0.39]; corrected +0.19 [+0.01, +0.41] |
| **E4 skills (showcase)** | + customer-data-cleanup skill | **Better**: pass rate 33% → 100% | **+0.44 [+0.22, +0.65]** |

In E1 and E3 the skill and the memory take their target tasks from 0.0–0.45 to 1.00 in every
repeat, held-out tasks included, but the 12-task CI stays close to zero because each factor
affects only 3 tasks. E4 is built around its skill (6 cleanup tasks + 2 controls): B passes all
24 trials, is cheaper per trial, and the CI is well above zero.
[Results](docs/results.md) covers all four, including the grader bugs that were found and fixed.

**Demo path:** open *E4 · customer data cleanup skill* → the verdict → a `cleanup-duplicates`
arm A run (failed checks with reasons, transcript, diff) → *A vs B on this task*. Then
**New skill config** → *Use an existing skill* → `customer-data-cleanup` to show how such a
config is made.

## Run a real experiment

1. `cp .env.example .env` and set `ANTHROPIC_API_KEY`. A key with a spend limit is recommended.
2. `docker compose up -d` (the API and worker read the key at start).
3. In the UI, click **New experiment**: name, factor, baseline and candidate config (the form
   only offers candidates that differ in exactly that factor), tasks, repeats, cost cap. Then
   press **Run**.

72 trials with Sonnet 5 cost about $2.5 and take about 20 minutes at concurrency 4. The
experiment stops if agent spend reaches its cost cap. See [costs](docs/costs.md).

## Test your own skill (in the UI)

1. Click **New skill config**. Pick a base config (e.g. `base`), then either **write a new
   skill** (name, when to use it, Markdown instructions; a template is provided) or **use an
   existing skill** (with a preview of its `SKILL.md`).
2. **Create config.** The new config is the base plus that skill and nothing else, so it is a
   valid *skills* candidate against the base.
3. **Start an experiment** opens the New experiment form with factor, baseline and candidate
   filled in. Pick tasks the skill is for, plus a couple of unrelated ones as controls, and run.

Skills written in the UI are stored in `data/skills/<name>/SKILL.md`, next to the trial data and
outside Git. To keep one, copy it to `skills/<name>/` and commit it. A skill only shows an effect
on tasks that need it, so add 3 or more such tasks (see below).

## Add your own (in Git)

**A task:** `tasks/<slug>/`

```
task.yaml          prompt, fixtures, timeout, graders
fixtures/          starting files, copied into /app (list each one in task.yaml)
checks/            checker scripts for `command` graders; only the verifier sees them
solution/solve.sh  reference solution; must score 1.0
```

```yaml
id: csv-summary
title: Revenue per region
category: tools # tools | coding | skill | memory | open
prompt: |
  Read data/sales.csv and write report.md ...
fixtures: [data/sales.csv]
timeoutSec: 300
graders: # weights sum to 1
  - { type: file_exists, id: exists, path: report.md, weight: 0.1, gate: true }
  - { type: command, id: totals, run: python3 /tests/checks/check.py, weight: 0.6 }
  - { type: regex, id: header, path: report.md, pattern: '^\| Region', flags: m, weight: 0.1 }
  - { type: json, id: data, path: out.json, expect: { north: 1 }, weight: 0.1 }
  - { type: llm_judge, id: clear, rubric: 'Is the table clear?', files: [report.md], weight: 0.1 }
```

A failed `gate` caps the score at 0.2 and skips the judge. `command` checks run in `/app`
inside the verifier container (Node 20, Python 3, pytest); exit 0 passes, and the last output
line becomes the reason shown in the UI. Then:

```sh
curl -X POST localhost:3000/api/v1/sync   # validate and load (errors show file:line:col)
pnpm oracle <slug>                        # the reference solution must score 1.00
```

**A config:** `configs/<id>.yaml` with `model`, `skills` (from `skills/<name>/SKILL.md`),
`toolsets`, `memory: { mode: off }` or `{ mode: seeded, files: [memory/…/MEMORY.md, …/USER.md] }`,
`maxTurns` and the pinned `hermesImageDigest`. See `configs/base*.yaml`.

**An experiment:** create it in the UI, or pre-register it as `experiments/<id>.yaml`
(hypothesis, tasks, held-out tasks, baseline, candidate, repeats, threshold, cost cap, seed) and
commit it before running. An experiment that has run is locked against YAML changes.

## Development

Requirements: Node ≥ 20.19, pnpm 10. `pnpm oracle` also needs Harbor on the host:
`uv tool install 'harbor==0.24.0' --python 3.12`.

```sh
pnpm install && pnpm build
pnpm lint
pnpm test        # unit tests; DB-backed tests run when TEST_DATABASE_URL points at a migrated DB
pnpm e2e         # full stack with a fake agent: 2 tasks × 2 arms, no API key, ~70 s
```

For the DB-backed tests:

```sh
docker run -d --rm --name evals-testdb -e POSTGRES_USER=evals -e POSTGRES_PASSWORD=evals \
  -e POSTGRES_DB=evals_test -p 55432:5432 postgres:16
export TEST_DATABASE_URL=postgresql://evals:evals@localhost:55432/evals_test
DATABASE_URL=$TEST_DATABASE_URL pnpm db:migrate && pnpm test
```

| Command | What it does |
|---|---|
| `pnpm oracle [slugs]` | Runs every task's reference solution through Harbor and the real verifier; all must score 1.00 |
| `pnpm calibrate` | Grades the 12 labelled judge cases in `calibration/judge/` twice; reports agreement |
| `pnpm rescore <experiment> <trial>=<score>…` | Recomputes an experiment's stats with replaced scores; writes nothing |
| `docker compose run --rm --no-deps -v $PWD/seed:/repo/seed api node dist/seed.export.cli <slug>…` | Writes `seed/demo.json.gz` from finished experiments in the compose DB; refuses files containing an API key |

To reset the demo: `docker compose down -v`, then delete `data/`.

## Troubleshooting

- **Trials fail with "all predefined address pools have been fully subnetted".** Each trial
  creates Docker networks, and Docker Desktop has a limited pool (about 30). Remove unused
  networks (`docker network prune`), stop other compose projects, or lower the experiment's
  concurrency. Such trials are recorded as infrastructure failures and excluded from the scores.
- **Port 3000 or 8080 in use.** Stop the other service or change the `ports` in
  `docker-compose.yml`.
- **A run is refused with "ANTHROPIC_API_KEY".** Set it in `.env` and restart:
  `docker compose up -d`.

## Layout

```
apps/api  apps/worker  apps/web       NestJS API, NestJS worker, Vue UI
packages/shared  db  grader  stats    schemas, Prisma, verifier-side grader, statistics
hermes_harbor/                        Harbor adapter for Hermes (Python)
docker/  docker-compose.yml           images and the one-command stack
tasks/  configs/  experiments/        the suite, in Git
skills/  memory/                      the changelog skill and the seeded memory
seed/  calibration/  e2e/             demo seed, judge calibration cases, e2e fixture repo
docs/                                 design, results, costs, limits, calibration, spike notes
```

## Documentation

- [Design](docs/design.md): architecture, isolation, grading, statistics, decisions, dependencies
- [Results](docs/results.md): E1–E3 verdicts, per-task deltas, sensitivity, chosen transcripts
- [Costs](docs/costs.md): measured agent and judge cost, per trial and per experiment
- [Limits](docs/limits.md): what the results can and cannot claim
- [Judge calibration](docs/judge-calibration.md) · [Day-1 spike notes](docs/spike-notes.md)
- Plans: [solution plan](agent-evals-solution-plan.md) · [implementation plan and build log](implementation-plan.md)

## Assumptions

- The reviewer runs it on a laptop with Docker Desktop; the worker needs the host Docker socket.
- Hermes is pinned by digest (v0.22.2) and Harbor to 0.24.0.
- An Anthropic API key is needed only for new runs; the demo needs none.
- "Better" means a higher mean task score on this suite. Cost and latency are reported but are
  not part of the verdict.
- The suite is a demonstration suite, and the CI describes this suite only.
- "Production-grade" means clean architecture, typed schemas, tests, logging and documented
  assumptions, not auth or multi-tenancy.
