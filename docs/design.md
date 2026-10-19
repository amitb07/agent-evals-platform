# Design

This is an A/B testing platform for agents. You change one thing in a Hermes configuration (a
skill, a tool, the memory or the model). The platform runs the same tasks k times with the
baseline (A) and k times with the candidate (B). It then gives a verdict of **Better**, **Worse**
or **Inconclusive**, with a 95% confidence interval. You can open every run to see **why** it
passed or failed.

![Architecture](../architecture-diagram.png)

Note: the diagram shows step 9 (statistics) in the worker. In the actual build, the API computes
the statistics when they are read (see [Statistics](#statistics)).

## Concepts

| Term | Meaning |
|---|---|
| Task | A prompt, starting files and graders (`tasks/<slug>/task.yaml`, `fixtures/`, `checks/`, `solution/`) |
| Config | The model, skills, toolsets, memory (off or seeded), turn limit and pinned Hermes digest (`configs/*.yaml`) |
| Experiment | Tasks × {A, B} × k repeats, plus a hypothesis, held-out tasks, pass threshold, cost cap and random seed (`experiments/*.yaml`) |
| Trial | One task × one config × one repeat, run in a fresh container with a fresh Hermes home |
| Verdict | Based on the bootstrap confidence interval of the average per-task difference between B and A |

**Main rule:** A and B may differ only in the experiment's factor. `factorViolation` checks this
in both the YAML sync and the API. The image digest and turn limit must always match.

## Components

```
apps/api       NestJS: YAML sync, REST API (/api/v1), stats on read, trial files, demo seed loader
apps/worker    NestJS: queue poller, config compiler, Harbor launcher, result ingestion, budget stop
apps/web       Vue 3 + Vite + Tailwind + ECharts: Experiments, New experiment, Compare, Run detail
packages/shared  zod schemas and types for YAML, Hermes and Harbor files, API DTOs
packages/db      Prisma schema, migrations, client (shared by api and worker)
packages/grader  grader CLI that runs in the verifier container (code checks + LLM judge)
packages/stats   pure statistics (bootstrap, MDE, pass@k), no I/O
hermes_harbor/   Harbor adapter for Hermes (Python, ~300 lines), plus a fake agent for the e2e test
docker/          one multi-stage Dockerfile (api, worker, web, migrate, verifier) + Hermes runner image
```

`docker compose up` starts:

- Postgres
- a one-time database migration
- the API
- the worker (with access to the host's Docker socket)
- the web app (served by nginx)
- two build-only services that tag the Hermes runner and verifier images

## How a run works

1. **Define.** Tasks, configs and experiments are YAML files in Git. The API loads them into
   Postgres at startup and whenever `POST /sync` is called. It checks every file against the
   shared zod schemas and reports errors as `file:line:col`. You can also create experiments in
   the UI.
2. **Queue.** `POST /experiments/:id/run` moves a draft to `queued` and creates all pending
   trials. A run needs `ANTHROPIC_API_KEY`.
3. **Prepare.** The worker claims the experiment (`FOR UPDATE SKIP LOCKED`). Then it:
   - builds a **Hermes home bundle** for each config, named by a hash of its content;
   - creates a **Harbor task directory** for each task;
   - writes one Harbor `job.yaml` with two agents, A and B;
   - writes a manifest with the image ids, the Harbor version, and hashes of the config, task and
     judge prompt.
4. **Run.** `harbor run -y -c job.yaml` runs k attempts of every task for both agents, at the
   chosen concurrency. Each trial has two containers:
   - **Agent container.** It uses the pinned Hermes image with the task files in `/app`, has CPU
     and memory limits, and can only reach `api.anthropic.com`. The adapter empties `/opt/data`,
     uploads the home bundle and runs:
     `hermes -m <model> --provider anthropic -t <toolsets> [--skills …] --yolo --in /app chat --query-file … --oneshot --format stream-json --max-turns N`.
     Afterwards it saves the stream-json events, the full session export
     (`hermes sessions export`) and a list of files written under the Hermes home. That list
     shows that nothing leaked between trials.
   - **Verifier container.** It is separate and clean. Only `/app` is copied over. `test.sh` runs
     the grader with the task's grader spec, which does not include the config or model name.
     The grader writes `reward.json` for Harbor and `grades.json` with every check's score and
     reason.
5. **Collect results.** While the job runs, and once more after it ends, the worker reads
   Harbor's trial directories. For each trial it:
   - sorts failures using Harbor's error rules;
   - removes the API key from every stored file;
   - copies the events, session and workspace to `trials/<id>/`;
   - saves the trial, grades and manifest to the database in one transaction.
6. **Check the budget.** After each pass, if spend has reached the cost cap or someone asked to
   stop, the worker sends SIGTERM to Harbor, and SIGKILL 30 s later.
7. **Decide and explain.** The API computes the statistics when they are read. The UI shows them
   in Compare and Run detail.

## Skill configs from the UI

`POST /configs` creates a new config from a base config plus one skill. The skill can be an
existing one or a new one written in the request. `GET /skills` lists the skills. The rules are:

- The new config copies every field of the base and adds the skill. So it differs from the base
  only in skills, and is always a valid candidate for a *skills* experiment.
- New skills are saved to `DATA_DIR/skills/<name>/SKILL.md`, because the repo is mounted
  read-only. The header (`name`, `description`, `version`) is generated; the body is your
  Markdown. A name that is already used by a repo skill or a custom skill is refused.
- When building a run, the worker looks for a skill in `skills/` first and in `DATA_DIR/skills`
  second. The skill's content goes into the home bundle, so the bundle hash in the run manifest
  records exactly what Hermes saw.
- UI configs are saved with `yamlHash = "ui:<sha256>"`. The YAML sync never deletes or
  overwrites them, unless a YAML file later uses the same id.
- If saving the config fails after a new skill file was written, the skill file is removed.

## Isolation: keeping A and B comparable

Hermes learns by default. So every way it can learn is turned off, and nothing carries over from
one trial to the next:

| Risk | What we do |
|---|---|
| State shared between trials | A new container and a fresh Hermes home for each trial. Bundles are read-only. |
| Built-in skills reaching the baseline | A `.no-bundled-skills` marker. Only the config's own skills are copied in. |
| Agent writing memory or skills | Memory off: `memory_enabled: false`, `user_profile_enabled: false`, and the `memory` and `skills` toolsets disabled. Memory seeded: the memory files are copied in with `write_approval: true`, so any write is only staged and is lost with the container. |
| Background self-review | `auxiliary.background_review.enabled: false` |
| Agent changing the graders | Checks live only in the verifier image and `tests/`. The agent never sees them. |
| Judge bias | The judge is a different, stronger model (`claude-opus-5`). It does not know the config or model. Each graded file is marked as untrusted with a random nonce. |
| Network | During the agent phase, only `api.anthropic.com` is allowed. The verifier has no network unless the task uses the judge. |

All of this was checked in the day-1 spike (`docs/spike-notes.md`).

## Grading

Graders run in the order of the spec:

1. `file_exists`
2. `regex`
3. `json` (partial credit for each expected key)
4. `command`: a checker script, run with `bash -lc` in its own process group, with a timeout and
   without the API key in its environment
5. `llm_judge`

How scores work:

- **Gates come first.** If a check marked `gate: true` fails, the task score is capped at 0.2 and
  the judge is skipped. This way, well-written text cannot hide a wrong answer.
- **Score** is the weighted sum of all checks (weights add up to 1). A trial **passes** when its
  score is at least the experiment's threshold (0.8).
- **Judge.** It uses the Messages API with structured output (a zod schema):
  `{score, passed, unknown, reason, evidence}`. If the output is malformed or refused, it is
  retried once. If it fails again, the trial is excluded as `verifier_failed`. No sampling
  parameters are set, because `claude-opus-5` does not accept them. Calibration results are in
  `judge-calibration.md`.
- **Reference solutions.** Every task has `solution/solve.sh`. `pnpm oracle` runs Harbor's oracle
  agent through the real verifier, and every task must score 1.0.

## Failures

We use Harbor's error rules, copied into `@evals/shared`:

| Outcome | Example | What happens |
|---|---|---|
| Valid failure | The agent ran out of turns or time, or gave a wrong answer | Scored (0 if there is nothing to grade). It counts against the config. |
| Infrastructure failure | Provider error 429/5xx, sandbox or verifier error | Harbor retries it twice. If it still fails, it is **excluded** and counted for that arm. |

Agent failures are never retried, because that would bias the results. In E1–E3, 0 of 216
trials were excluded.

## Statistics

We measure the average of (B − A) task scores over this suite. The code is in
`packages/stats`; it has no side effects and always gives the same answer for the same input.

1. For each task and arm, take the mean score over the valid repeats. Invalid trials are
   excluded and counted.
2. For each task, compute the difference: `d[t] = mean_B[t] − mean_A[t]`.
3. **Effect** = the mean of `d`. The **95% CI** comes from a percentile bootstrap over tasks
   (10,000 draws, `mulberry32` seeded with the experiment's seed, R type-7 quantiles). As a
   sensitivity check, we also run a two-stage bootstrap (tasks, then repeats).
4. **Verdict:** if the CI is above 0, B is Better. If it is below 0, B is Worse. Otherwise it is
   Inconclusive. Better or Worse also needs at least **6 paired tasks**. With fewer tasks, a
   percentile bootstrap is above 0 whenever every difference is positive, while a sign test only
   becomes significant at 5% from n = 6.
5. **MDE** (minimum detectable effect, computed after the run) = (1.96 + 0.84) × SD(d) / √n.
   This means 95% confidence and 80% power.
6. We also report:
   - the difference per task (dot plot and table), with a "flaky" flag when repeats differ by
     an SD above 0.25
   - pass@1, pass@k and pass^k
   - gate failures and failure causes
   - cost per trial and per pass, latency and tokens

The API computes the statistics when they are read (about 16 ms for 72 trials) and caches them
in `StatsSnapshot`. The cache key is the number of collected trials, so a cached value is never
out of date. `pnpm rescore` uses the same function for sensitivity checks.

## Reproducibility

- Pinned versions: Hermes by digest (v0.22.2, multi-arch index), Harbor 0.24.0, and the models
  `claude-sonnet-5` and `claude-opus-5`.
- Each trial's run manifest stores the image references and ids, the Harbor version, and hashes
  of the task YAML, the generated Harbor task, the home bundle and the judge prompt.
- Experiments are planned ahead. The YAML (hypothesis, tasks, held-out tasks, threshold, k, seed,
  cost cap) is committed before the run. Once an experiment leaves the draft state, YAML changes
  no longer affect it.

## Key decisions

| Decision | Choice | Why | Alternative |
|---|---|---|---|
| Trial runner | Harbor, started by the worker | It already handles containers, limits, network rules, a separate verifier, retries and result layout. This saved about a day. | Our own Docker runner (planned as a fallback, not needed) |
| Running Hermes without a UI | `chat --oneshot --format stream-json` plus a session export | We get tool events and the exit code. The export has full tool outputs (events cut them at 5,000 characters). | `-z` only prints the final text |
| Queue | The worker polls Postgres, one experiment at a time | Harbor already handles concurrency, so no extra message broker is needed | pg-boss, Redis |
| Where statistics are computed | In the API, when read, then cached | Always matches the collected trials, and cheap | The worker computes them when the run ends |
| Grading | Code checks with gates, the judge second, in a separate container | Exact checks wherever possible; the agent cannot touch the checkers | Judge-only grading |
| Judge model | Opus for a Sonnet agent | Avoids a model favouring its own output; a stronger grader | The same model as the agent |
| Score | Weighted, 0 to 1, with partial credit | Gives a narrower CI than pass/fail | Pass/fail only |
| Demo | A seed of real experiments, loaded into an empty database when the API starts | The reviewer sees real results without an API key | Static screenshots |
| UI updates | Polling every 5 s | Simple, and enough for trials that take minutes | Server-sent events |

## Dependencies

| Component | Version | License |
|---|---|---|
| Hermes Agent (the system under test) | v0.22.2, pinned digest | MIT |
| Harbor (trial runner) | 0.24.0 | Apache-2.0 |
| NestJS | 11 | MIT |
| Prisma | 7.10 | Apache-2.0 |
| PostgreSQL | 16 | PostgreSQL License |
| Vue / vue-router | 3.5 / 5.4 | MIT |
| Vite / Vitest | 8 / 4 | MIT |
| Tailwind CSS / Headless UI | 4.3 / 1.7 | MIT |
| ECharts / vue-echarts | 6.1 / 8.3 | Apache-2.0 / MIT |
| zod | 4 | MIT |
| @anthropic-ai/sdk | 0.135 | MIT |
| jsdiff (`diff`) | 9 | BSD-3-Clause |
| yaml | 2.9 | ISC |
| Jest | 30 | MIT |

These versions come from `pnpm-lock.yaml` and `docker/`. Notes on the toolchain (why NestJS 11,
Node 20.19+ and TypeScript 6) are in `implementation-plan.md` §16.
