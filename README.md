# Agent Evals on Hermes

A platform for A/B testing [Hermes Agent](https://github.com/NousResearch/hermes-agent).

You change one thing in the agent: a skill, a toolset, its memory or the model. The platform
runs the same tasks several times with the old setup (A, the baseline) and the new setup (B, the
candidate). It then tells you whether B is **Better**, **Worse** or **Inconclusive**, with a 95%
confidence interval. You can open any run to see why it passed or failed: the transcript, the
files the agent changed, and the reason from every grader.

Built with NestJS (API and worker), Vue 3 + TypeScript, Postgres and Docker.
[Harbor](https://github.com/harbor-framework/harbor) runs the trials.

![Compare screen](docs/screenshots/e1-compare.png)

## Quick start (demo, no API key needed)

You will need Docker Desktop with about 15 GB of free space. The pinned Hermes image alone is
4.5 GB. It was tested on macOS with Apple silicon.

```sh
docker compose up
```

Then open <http://localhost:8080>. The first build takes several minutes.

On first start, the API loads a demo with four finished experiments (264 real trials). Every
screen works without an API key:

- **Experiments**: the list, progress and spend; the **New experiment** form; **New skill config**.
- **Compare**: the verdict, effect, 95% CI, MDE, change per task, score vs. cost, and pass@k for
  each arm.
- **Run detail**: a one-line outcome, the transcript (tool calls, arguments, outputs), grades with
  reasons, A vs. B on the same task, and the files the agent changed.

Health check: <http://localhost:3000/api/v1/health>.

## Results

We ran four experiments, each planned and committed before it ran. The agent was Sonnet 5 and
the judge was Opus 5. Total agent spend was $14.8. Please see the
[full write-up](docs/results.md) for details.

| Experiment | Change | Verdict | Effect [95% CI] |
|---|---|---|---|
| E1 skills | + changelog-format skill | Inconclusive | +0.20 [−0.01, +0.44] |
| E2 tools | + file toolset | Inconclusive (tool errors 28 → 14) | −0.02 [−0.04, 0.00] |
| E3 memory | seeded user preferences | Inconclusive; **Better** after a disclosed grader fix | +0.15 [−0.06, +0.39]; corrected +0.19 [+0.01, +0.41] |
| **E4 skills (showcase)** | + customer-data-cleanup skill | **Better**: pass rate 33% → 100% | **+0.44 [+0.22, +0.65]** |

In E1 and E3, the skill and the memory lift their target tasks from 0.0–0.45 to 1.00 in every
repeat, including held-out tasks. Still, the confidence interval over all 12 tasks stays close to
zero, because each change affects only 3 of them.

E4 was built around its skill: 6 cleanup tasks plus 2 control tasks. B passes all 24 trials,
costs less per trial, and the interval is well above zero. The [results](docs/results.md) page
covers all four experiments, including the grader bugs we found and fixed.

**Suggested demo path:**

1. Open *E4 · customer data cleanup skill* and look at the verdict.
2. Open a `cleanup-duplicates` run from arm A. You will see the failed checks with reasons, the
   transcript and the diff.
3. Click *A vs B on this task*.
4. Click **New skill config** → *Use an existing skill* → `customer-data-cleanup` to see how a
   config like this is made.

## Run a real experiment

1. Run `cp .env.example .env` and set `ANTHROPIC_API_KEY`. We recommend a key with a spend limit.
2. Run `docker compose up -d`. The API and worker read the key when they start.
3. In the UI, click **New experiment**. Fill in a name, the factor, the baseline and candidate
   configs, the tasks, the number of repeats and a cost cap. The form only offers candidates that
   differ from the baseline in that one factor. Then press **Run**.

72 trials with Sonnet 5 cost about $2.5 and take about 20 minutes at concurrency 4. The
experiment stops if agent spend reaches its cost cap. See [costs](docs/costs.md).

## Test your own skill (in the UI)

1. Click **New skill config** and pick a base config, for example `base`. Then either **write a
   new skill** (a name, when to use it, and instructions in Markdown; a template is provided) or
   **use an existing skill** (you will see a preview of its `SKILL.md`).
2. Click **Create config**. The new config is the base plus that one skill, so it is a valid
   *skills* candidate against the base.
3. Click **Start an experiment**. The New experiment form opens with the factor, baseline and
   candidate already filled in. Pick the tasks the skill is meant for, add a couple of unrelated
   tasks as controls, and run.

Skills written in the UI are saved in `data/skills/<name>/SKILL.md`, next to the trial data and
outside Git. To keep one, please copy it to `skills/<name>/` and commit it.

A skill only shows an effect on tasks that need it, so please add 3 or more such tasks (see below).

## Add your own (in Git)

**A task** lives in `tasks/<slug>/`:

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

A few rules:

- If a check marked `gate` fails, the score is capped at 0.2 and the judge is skipped.
- `command` checks run in `/app` inside the verifier container, which has Node 20, Python 3 and
  pytest. Exit code 0 means pass. The last line of output is shown in the UI as the reason.

Then load and test the task:

```sh
curl -X POST localhost:3000/api/v1/sync   # validate and load (errors show file:line:col)
pnpm oracle <slug>                        # the reference solution must score 1.00
```

**A config** lives in `configs/<id>.yaml`. It sets:

- `model`
- `skills` (taken from `skills/<name>/SKILL.md`)
- `toolsets`
- `memory`: either `{ mode: off }` or `{ mode: seeded, files: [memory/…/MEMORY.md, …/USER.md] }`
- `maxTurns`
- the pinned `hermesImageDigest`

See `configs/base*.yaml` for examples.

**An experiment** can be created in the UI. You can also plan it ahead as
`experiments/<id>.yaml` (hypothesis, tasks, held-out tasks, baseline, candidate, repeats,
threshold, cost cap, seed) and commit it before running. Once an experiment has run, its YAML
can no longer change it.

## Development

You will need Node ≥ 20.19 and pnpm 10. `pnpm oracle` also needs Harbor on your machine:
`uv tool install 'harbor==0.24.0' --python 3.12`.

```sh
pnpm install && pnpm build
pnpm lint
pnpm test        # unit tests; database tests run when TEST_DATABASE_URL points at a migrated DB
pnpm e2e         # full stack with a fake agent: 2 tasks × 2 arms, no API key, ~70 s
```

To run the database tests:

```sh
docker run -d --rm --name evals-testdb -e POSTGRES_USER=evals -e POSTGRES_PASSWORD=evals \
  -e POSTGRES_DB=evals_test -p 55432:5432 postgres:16
export TEST_DATABASE_URL=postgresql://evals:evals@localhost:55432/evals_test
DATABASE_URL=$TEST_DATABASE_URL pnpm db:migrate && pnpm test
```

| Command | What it does |
|---|---|
| `pnpm oracle [slugs]` | Runs each task's reference solution through Harbor and the real verifier. All must score 1.00. |
| `pnpm calibrate` | Grades the 12 labelled judge cases in `calibration/judge/` twice and reports how often the judge agrees with the labels. |
| `pnpm rescore <experiment> <trial>=<score>…` | Recomputes an experiment's statistics with some scores replaced. Writes nothing. |
| `docker compose run --rm --no-deps -v $PWD/seed:/repo/seed api node dist/seed.export.cli <slug>…` | Writes `seed/demo.json.gz` from finished experiments in the compose database. Refuses any file that contains an API key. |

To reset the demo, run `docker compose down -v` and then delete `data/`.

## Troubleshooting

- **Trials fail with "all predefined address pools have been fully subnetted".** Each trial
  creates Docker networks, and Docker Desktop has a limited pool (about 30). Please remove unused
  networks (`docker network prune`), stop other compose projects, or lower the experiment's
  concurrency. These trials are recorded as infrastructure failures and left out of the scores.
- **Port 3000 or 8080 is in use.** Stop the other service, or change the `ports` in
  `docker-compose.yml`.
- **A run is refused with "ANTHROPIC_API_KEY".** Set the key in `.env` and restart with
  `docker compose up -d`.

## Layout

```
apps/api  apps/worker  apps/web       NestJS API, NestJS worker, Vue UI
packages/shared  db  grader  stats    schemas, Prisma, verifier-side grader, statistics
hermes_harbor/                        Harbor adapter for Hermes (Python)
docker/  docker-compose.yml           images and the one-command stack
tasks/  configs/  experiments/        the suite, in Git
skills/  memory/                      the skills and the seeded memory
seed/  calibration/  e2e/             demo seed, judge calibration cases, e2e fixture repo
docs/                                 design, results, costs, limits, calibration, spike notes
```

## Documentation

- [Design](docs/design.md): how the system is built, how runs are isolated and graded, the
  statistics, key decisions and dependencies
- [Results](docs/results.md): E1–E4 verdicts, changes per task, sensitivity checks and selected
  transcripts
- [Costs](docs/costs.md): measured agent and judge cost, per trial and per experiment
- [Limits](docs/limits.md): what the results can and cannot claim
- [Judge calibration](docs/judge-calibration.md) · [Day-1 spike notes](docs/spike-notes.md)
- Plans: [solution plan](agent-evals-solution-plan.md) · [implementation plan and build log](implementation-plan.md)

## Assumptions

- The reviewer runs it on a laptop with Docker Desktop. The worker needs the host's Docker socket.
- Hermes is pinned by digest (v0.22.2) and Harbor to 0.24.0.
- An Anthropic API key is only needed for new runs. The demo needs none.
- "Better" means a higher mean task score on this suite. Cost and speed are reported, but they do
  not affect the verdict.
- This is a demonstration suite. The confidence interval describes this suite only.
- "Production-grade" here means clean architecture, typed schemas, tests, logging and written
  assumptions. It does not include login or support for multiple teams.
