# Agent Evals Platform on Hermes — Plan

> Stack: NestJS (API + worker) · Vue 3 + TypeScript · Postgres · Docker · Harbor (trial runner)
> System under test: [Hermes Agent](https://github.com/NousResearch/hermes-agent) · Timebox: 5 days · Updated 2026-10-18

---

## 1. Goal

When we change one thing in the agent (a skill, a tool, memory, the model), we want to know with evidence whether it got **better, worse, or stayed the same**, how **confident** we can be, and **why** each run passed or failed.

So this is an **A/B test for agents**: baseline config A vs. candidate config B, same pinned Hermes image, same tasks, repeated k times, compared task by task with a confidence interval.

| The assignment asks for | Where it is |
|---|---|
| Define tasks and how each is scored | `tasks/*.yaml` with graders (§4, §8) |
| Define agent configs: model, skills, memory, tools | `configs/*.yaml` compiled into a Hermes home (§4) |
| Run the tasks under each config | Worker + Harbor (§3) |
| Show which config is better and how confident | Compare screen: paired effect, 95% CI, verdict (§6, §7) |
| Inspect one run to see why it passed or failed | Run detail screen (§7) |
| NestJS, Vue 3, TypeScript, one command, sample tasks, assumptions | §3, §8, §15 |

---

## 2. Concepts

| Term | Meaning |
|---|---|
| **Hermes** | The agent under test. Open-source harness with tools, skills, memory and profiles. Self-improving by default, so every learning path must be switched off for a fair test. |
| **Harbor** | The trial runner. Open-source (Apache-2.0, Python) tool that runs any agent on container tasks with retries, limits, network policy and a separate grading container. Hidden behind a NestJS `Runner` interface. |
| **Task** | Prompt + starting files + graders. |
| **Config** | Model, skills, toolsets, memory (off or seeded), turn budget. Compiled into a fresh Hermes home for every trial. |
| **Trial** | One task × one config × one repeat. |
| **Experiment** | All tasks × {A, B} × k repeats, plus the comparison. |
| **Outcome** | Final state of the workspace. We grade the outcome, not the path. |
| **Verdict** | Better / Worse / Inconclusive, with a 95% CI. |

Rule: **change one thing at a time.**

---

## 3. Architecture

```
 tasks/*.yaml  configs/*.yaml  experiments/*.yaml      (in Git, synced to DB)
                      │
 [Vue UI] ─"Run"─▶ [NestJS API] ─▶ [Postgres] ◀─ [NestJS worker]
                                                    │ 1. compile config → Hermes home bundle
                                                    │ 2. generate Harbor task dirs from YAML
                                                    │ 3. spawn `harbor run` (agents A and B,
                                                    │    -k repeats, -n 4, -r 2)
                                                    │ 4. ingest result files → Postgres
                                                    ▼
                                   [Harbor] per trial
                                     agent container: pinned Hermes image, cpu/mem limits,
                                       egress allowed only to api.anthropic.com
                                       → hermes -m … --provider anthropic -t … --skills … --yolo --in /app
                                           chat --query-file prompt --oneshot --format stream-json --max-turns N
                                       → hermes sessions export → session.jsonl (messages, cost, end reason)
                                     verifier container: clean Node image, no egress,
                                       only /app copied in → TypeScript grader → reward.json
                                                    ▼
                                   [Stats] paired Δ per task → bootstrap 95% CI → verdict
                                                    ▼
 [Vue UI] ◀ Compare: verdict, CI, task deltas, cost   ◀ Run: transcript, diff, grader reasons
```

**One command:** `docker compose up` starts Postgres, API, worker (Node + Python 3.12 + Harbor, with the host Docker socket), and the UI, and pulls the pinned Hermes image. A seeded **demo experiment** makes every screen work without an API key. Real runs need `ANTHROPIC_API_KEY` in `.env`.

```
apps/api  apps/worker  apps/web  packages/shared (zod schemas)  packages/grader (TS, runs in verifier)
harbor/hermes_agent.py   the one Python file: Harbor adapter for Hermes
docker/hermes  docker/verifier  docker/worker
tasks/  configs/  experiments/  seed/  docs/
```

### How Harbor runs one trial

1. Starts the agent container from the task's image with the limits and network policy in `task.toml`.
2. Calls our adapter: `run()` uploads the Hermes home bundle and executes the `hermes chat` command inside the container.
3. Syncs `/logs/`, then calls `populate_context_post_run()`, where we read `usage.json` into tokens and cost and write an ATIF `trajectory.json`.
4. Starts a **fresh** verifier container, copies in only the declared `/app` artifact, runs `/tests/test.sh`, reads `/logs/verifier/reward.json`.
5. Writes `result.json` (tokens, cost, reward, timing, classified failure) plus agent and verifier logs.
6. Applies its error policy: provider 429/5xx and sandbox failures are retried; agent timeouts count as valid failures and are never retried.

---

## 4. Tasks and configs

### Task (our YAML)

```yaml
id: csv-summary-01
category: tools
prompt: Read data/sales.csv and write report.md with total revenue per region, sorted descending.
fixtures: [data/sales.csv]
timeoutSec: 300
graders:
  - { type: file_exists, path: report.md, weight: 0.2 }
  - { type: command, run: node /tests/checks/check_report.js report.md, weight: 0.6, gate: true }
  - { type: llm_judge, rubric: "Is the report clear and formatted as a table?", weight: 0.2 }
```

`gate: true` means a failed check caps the total score (at 0.2 here), so a well-written wrong answer cannot pass on prose.

The worker turns this into a Harbor task: `instruction.md`, fixtures under `/app`, and a `task.toml` with `cpus`, `memory_mb`, `[agent] network_mode = "allowlist"` for `api.anthropic.com`, `[verifier] environment_mode = "separate"` using our verifier image, and `artifacts = ["/app"]`. Grader scripts live in the verifier image, never in the agent workspace.

### Config

```yaml
id: haiku-with-changelog-skill
hermesImageDigest: sha256:…
model: claude-haiku-4-5
provider: anthropic
skills: [changelog-format]
toolsets: [terminal, file]
memory: { mode: off }        # or seeded
maxTurns: 40
```

### What the compiler writes into the Hermes home (verified in Hermes docs)

| Config | Hermes |
|---|---|
| model, provider | `--model`, `--provider`; key forwarded by Harbor for the agent phase only |
| toolsets | `--toolsets terminal,file` |
| skills | `skills/<name>/SKILL.md` + `--skills <name>`; marker file `.no-bundled-skills` so Hermes does not seed its bundled skills |
| maxTurns | `--max-turns N` |
| memory off | `memory.memory_enabled: false`, `memory.user_profile_enabled: false`, `agent.disabled_toolsets: [memory]` |
| memory seeded | `memories/MEMORY.md` + `USER.md`; `memory_enabled: true`; `memory.write_approval: true` (writes are staged, then die with the container) |
| always | `auxiliary.background_review.enabled: false`; `skills` toolset disabled (no `skill_manage`); `database.journal_mode: delete` |

Do not pass `--ignore-rules` (it skips memory and skills). Skills must be self-contained in `SKILL.md` because `skill_view` is disabled.

### The adapter (`hermes_harbor/hermes_agent.py`, built and verified on day 1)

```python
class HermesAgent(BaseInstalledAgent):
    options: arm, home_bundle, toolsets, skills, max_turns     # passed with --ak
    MODEL_CONNECTION: provider anthropic, key env ANTHROPIC_API_KEY
    run(instruction, env, ctx):
        empty /opt/data, upload home_bundle, upload instruction file
        hermes -m … --provider anthropic -t … [--skills …] --yolo --in /app
               chat --query-file … --oneshot --format stream-json --max-turns N
               > /logs/agent/events.jsonl
        list files written under /opt/data → home-writes.txt (isolation evidence)
        hermes sessions export --format jsonl → /logs/agent/session.jsonl
        raise a Harbor provider error on rate-limit / overload / auth failures
    populate_context_post_run(ctx):
        result event → tokens; session export → cost, end reason; events → trajectory.json
```

A and B are the same class with different `--ak` values, in one Harbor job.

---

## 5. Key decisions

| Decision | Choice | Why |
|---|---|---|
| Runner | Harbor behind a `Runner` interface | Saves about a day: containers, retries, limits, network policy, separate verifier, regrade, result layout. Fallback: direct Docker runner if the day-1 spike fails. |
| Isolation | New container and fresh Hermes home per trial | Hermes profiles are mutable; never reuse one. |
| Self-learning | All paths off (table in §4) | Hermes has no single switch. Fresh container discards any staged write. |
| Headless run | `hermes chat -q --oneshot --yolo --format stream-json` | Gives tool events and exit code. `-z` prints only final text. `--yolo` avoids approval prompts that would hang. |
| Transcript | stream-json events + full session export | Events cap tool output at 5000 chars; the session export is complete. |
| Grading | Separate verifier container, TypeScript grader, code checks with gates first, LLM judge second | Agent cannot touch checkers. Gates stop prose from masking wrong answers. |
| Judge | Different, stronger Anthropic model; blinded; no tools; strict JSON with `unknown`; candidate text fenced as untrusted | Avoids self-preference and injection. Calibrated on ~12 labeled runs, 2 of them injection attempts. |
| Score | Weighted 0..1 after gates; `passThreshold` 0.8 defines "pass" | Partial credit narrows the CI. |
| Failures | Harbor policy: provider and sandbox failures retried twice; agent budget exhaustion is a valid failed result | Retrying agent failures would bias results. Counts reported per arm. |
| Budget | `costCapUsd` per experiment plus a spend limit on the key | No runaway runs. |
| Reproducibility | Image digests, Harbor version, run manifest with hashes of task, fixtures, compiled home, grader, judge prompt | Every result traces to exact versions. |
| Queue | Worker polls Postgres; one Harbor job at a time | Harbor owns concurrency; no pg-boss. |
| Demo mode | Seeded finished experiment | Reviewer sees the UI without a key. |

---

## 6. Statistics

Estimand: the mean of candidate-minus-baseline task scores over this suite. No claim beyond the suite.

1. `score[t][c]` = mean over k repeats (invalid trials excluded and counted).
2. `d[t] = score[t][B] − score[t][A]`.
3. Effect = mean of `d[t]`. 95% CI = bootstrap over tasks (10k draws, fixed seed). Sensitivity check: two-stage bootstrap (tasks, then repeats).
4. Verdict: CI above 0 → **Better**; below 0 → **Worse**; contains 0 → **Inconclusive**, with the minimum detectable effect from the observed spread.
5. Also shown: every task delta as dots, pass@1, pass@k, pass^k, gate failures, cost per trial and per pass, latency, tool errors, infra failures and exclusions by arm.

With 12 tasks and 3 repeats only large effects are conclusive. Category breakdowns are descriptive only.

---

## 7. UI (three screens, polling)

1. **Experiments.** List and create: factor, tasks, A, B, k, cost cap. Progress and spend.
2. **Compare.** Verdict banner with effect, CI, MDE. Task table and delta dots. Score vs. cost. pass@1 / @k / ^k. Infra counts by arm.
3. **Run detail.** Transcript timeline (tool calls, arguments, outputs), file diff of `/app`, each grader's score and reason, failure cause, side-by-side A vs. B for the same task.

---

## 8. Task suite (12 tasks, offline)

| Category | # | Graded by | Sensitive to |
|---|---|---|---|
| File/tool tasks | 3 | Code | Tools |
| Coding tasks with unit tests | 2 | Tests | Model |
| Skill-dependent (house changelog format) | 3 | Code + judge | Skills |
| Memory-dependent (seeded user preference) | 3 | Code | Memory |
| Open-ended summary of local docs | 1 | Judge | Model |

Rules: no grader files or `.git` in the workspace; every task has a `solution/` that passes (Harbor's oracle run); the skill and the seeded memory are frozen **before** their tasks are finalized, with one held-out task each.

---

## 9. Experiments

| Experiment | A | B | Hypothesis |
|---|---|---|---|
| **E1 skills** (headline) | no skills | `changelog-format` skill | B better on skill tasks, unchanged elsewhere |
| **E2 tools** | `[terminal]` | `[terminal, file]` | B better on file tasks, fewer tool errors |
| **E3 memory** | memory off | memory seeded | B better on memory tasks, unchanged elsewhere |

Each: 12 tasks × 2 configs × 3 repeats = 72 trials. Order: 2-task smoke → E1 → E2 → E3. If short on time or budget, E2 and E3 run at k=2 and say so. Each experiment is pre-registered in `experiments/<name>.yaml` (hypothesis, tasks, held-outs, threshold, config hashes, k, seed, retry policy, cost cap) before the final run. Report: verdict, CI, MDE, delta dots, cost, judge agreement, and transcripts chosen by a fixed rule (every A/B disagreement, every exclusion, every judge/code disagreement, plus 2 random agreements).

---

## 10. Models and cost

| Model | In $/M | Out $/M | ≈ per trial | ≈ 216 trials | Role |
|---|---|---|---|---|---|
| `claude-haiku-4-5` | 1 | 5 | $0.06 | $13 | agent (default) |
| `claude-sonnet-5` | 2 | 10 | $0.12 | $26 | agent (stronger) or judge |
| `claude-opus-5` | 5 | 25 | $0.31 | $67 | judge for a Sonnet agent |

Assumes ~10 calls per trial, ~15k context tokens per call with 80% cache hits, ~4k output tokens. Measured on day 1 from `usage.json`. Default: Haiku agent + Sonnet judge ≈ $15–20 total. Sonnet agent + Opus judge ≈ $35–45. Local infra ≈ $0.

---

## 11. Known limits

- Small suite: 12 tasks × 3 repeats detects only large effects.
- Judge lightly calibrated (~12 runs).
- Docker is not a strong security boundary; trusted local use only.
- Network allowlist depends on Harbor's nftables sidecar working on Docker Desktop; otherwise the agent phase has full egress.
- No explicit A/B order randomization; both arms interleave under one Harbor scheduler.
- Worker holds the host Docker socket.
- Memory tested in seeded mode only; no learn-then-recall loop.
- Offline synthetic tasks; provider non-determinism adds noise.
- Hermes and Harbor pinned; upstream changes need a re-run.
- One Python file (the adapter) in a TypeScript codebase.
- No auth, multi-user, CI or cloud.

---

## 12. Day-1 checks (hard timebox; else fall back to a direct Docker runner)

1. One Hermes trial completes under `harbor run … -a harbor.hermes_agent:HermesAgent -e docker` with `reward.json` from our verifier image.
2. `--provider anthropic --model …`, `--toolsets`, `--skills`, `--max-turns` take effect; toolset names confirmed with `hermes tools`.
3. A home with `.no-bundled-skills` starts with an empty `skills/`.
4. With memory off, no `memory` or `skill_manage` tool is offered and nothing is written under `memories/`, `skills/`, `pending/`.
5. With memory seeded, the `MEMORY.md` text reaches the system prompt.
6. `hermes sessions export` returns full tool outputs; `usage.json` has cost, tokens, `session_id`, `turn_exit_reason`.
7. Tokens and cost appear in Harbor's `result.json`; `trajectory.json` passes Harbor's validator.
8. Agent-phase allowlist works on Docker Desktop: LLM call succeeds, `curl example.com` fails.
9. Separate verifier sees `/app`; a tampered checker in the workspace has no effect.
10. Measured: container start time, trials per minute at `-n 4`, tokens and cost per trial.

---

## 13. Five-day plan

| Day | Build | Done when |
|---|---|---|
| 1 | AM: Harbor + Hermes spike (checks 1–10). PM: monorepo, Postgres, zod schemas, YAML loaders, `docker compose up` | One Hermes trial runs under Harbor with tokens, cost and reward; one command starts everything |
| 2 | Worker: config compiler (snapshot-tested), Harbor task generator, `harbor run` launcher, result ingestion. Grader package + verifier image. E2E test with a fake agent that writes files (no LLM) | 2 tasks × 2 configs × 1 repeat runs unattended on the fake agent; grades in Postgres; CI needs no key |
| 3 | API, stats with known-answer tests, UI Experiments + Compare. 2-task smoke on real Hermes | Compare screen shows a verdict with CI |
| 4 | UI Run detail. 12-task suite, skill, seeded memory, oracle run, judge calibration. Pre-register and run E1, then E2, E3 | Any pass/fail explainable from the UI; E1 complete |
| 5 | README, design doc, limits, costs, results, assumptions. Demo seed from E1. 3-minute video. Buffer | All six deliverables ready |

Skip: task editor UI, live streaming, auth, cloud sandboxes, RewardKit, pg-boss, full test coverage.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Harbor + Hermes do not work together on day 1 | Timebox; `Runner` interface first; direct Docker fallback reuses the same home bundle and grader image |
| Allowlist fails on Docker Desktop | Run agent phase `public`; document |
| Baseline silently contains bundled skills | Marker file; check 3; `skills_list` stored in the manifest |
| Key leaks into transcripts | Harbor forwards it to the agent phase only; redaction on ingestion; spend-capped key |
| Rate limits or overspend | `-n 4`, cost cap, Haiku agent, staged runs, Harbor retries on 429 |
| Agent games the grader | Separate verifier; only `/app` crosses; checkers in the verifier image |
| Suite tuned to make B win | Skill and memory frozen first; one held-out task each; pre-registered file |
| Three experiments do not fit | E1 is the deliverable; E2/E3 at k=2 or reported partial |

---

## 15. Deliverables and assumptions

**Deliverables:** (1) code + README with one-command setup, demo mode, how to add tasks/configs/experiments; (2) design doc from §3–6 with a dependency list (Hermes MIT, Harbor Apache-2.0); (3) limits (§11); (4) costs (§10, measured); (5) E1 results, E2/E3 as available; (6) 3-minute video: demo → create experiment → trials running → verdict → one failed run explained.

**Assumptions (go in the README):**
- Reviewer runs on a laptop with Docker Desktop; the worker needs the host Docker socket.
- Hermes pinned by digest (main, 2026-10-18); Harbor pinned to 0.24.x.
- Own Anthropic key with a console spend limit; budget $20–50.
- "Better" = higher mean task score under a fixed budget; cost and latency reported, not part of the verdict.
- The suite is a demonstration suite; the CI describes this suite only.
- "Production-grade" = clean architecture, typed schemas, tests, logging, documented assumptions; not auth or multi-tenancy.
- Local only for now; GitHub later, with no secrets in the repo.

---

## References

Anthropic: [Demystifying evals for AI agents](https://anthropic.com/engineering/demystifying-evals-for-ai-agents) · [A statistical approach to model evals](https://anthropic.com/research/statistical-approach-to-model-evals) · [Infrastructure noise](https://www.anthropic.com/engineering/infrastructure-noise)
Hermes: [Repo](https://github.com/NousResearch/hermes-agent) · [CLI](https://hermes-agent.nousresearch.com/docs/reference/cli-commands) · [Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory) · [Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) · [Docker](https://hermes-agent.nousresearch.com/docs/user-guide/docker)
Harbor: [Repo](https://github.com/harbor-framework/harbor) · [Custom agents](https://docs.harborframework.com/agents/custom-agents) · [Task config](https://docs.harborframework.com/tasks/configuration) · [Separate verifier](https://docs.harborframework.com/tasks/separate-verifier) · [Network policies](https://docs.harborframework.com/tasks/network-policies) · [Error classification](https://docs.harborframework.com/jobs/error-classification)
