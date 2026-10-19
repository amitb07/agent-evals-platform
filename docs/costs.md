# Costs

All numbers were measured on 2026-10-18 and 2026-10-19. Agent cost is Hermes' own estimate per
session (`estimated_cost_usd` from `hermes sessions export`, `cost_status: estimated`). It is
not an invoice.

## What we spent

| Item | Trials or calls | Cost |
|---|---|---|
| E1 skills, agent | 72 trials | $2.24 |
| E2 tools, agent | 72 trials | $2.72 |
| E3 memory, agent | 72 trials | $2.43 |
| E4 cleanup skill (v2), agent | 48 trials | $7.38 |
| E4 v1, stopped after a grader fix, agent | 12 trials | $1.59 |
| Smoke run (step 18), agent | 4 trials | $0.08 |
| Day-1 spike, agent | a few trivial trials (≈ $0.006 each) | < $0.10 |
| Judge (`claude-opus-5`): E1–E3, smoke, oracle runs, calibration, injection checks | ≈ 50 calls × $0.015 | ≈ $0.75 |
| **Total** | | **≈ $17.3** |

The budget was $20–50. Local infrastructure (Docker Desktop on a laptop) cost nothing extra.

The E4 cleanup tasks are heavier than the E1–E3 tasks, because the agent writes and runs a
script. Each cleanup trial cost $0.13–0.27 and took 2–4 minutes.

## Per trial (E1–E3, 216 trials, `claude-sonnet-5`)

| Measure | Value |
|---|---|
| Average agent cost | **$0.034** (min $0.010, max $0.256) |
| Average tokens in / out | 34.8k / 1.7k; 30.5k of the input (88%) are cache reads |
| Average trial time (agent + verifier, start to end) | 61 s |
| Time for one experiment (72 trials, concurrency 4) | 17–20 min |

By task category:

| Category | Average cost | Average time |
|---|---|---|
| tools | $0.017 | 45 s |
| memory | $0.020 | 48 s |
| open | $0.023 | 52 s |
| coding | $0.036 | 84 s |
| skill | $0.069 | 78 s |

Skill tasks cost the most when the skill is missing, because the baseline searches for a format
to copy. In E1, a skill trial cost $0.076 in arm A and $0.027 in arm B.

## Judge

One judge call on `open-docs-onboarding` used 1,061 input and 392 output tokens (83 of them for
thinking). That is **≈ $0.015** at $5 / $25 per million tokens.

The judge is only called for tasks with an `llm_judge` grader, and only when every gate passed.
In E1–E3 that is one task: 18 calls across the three experiments, or ≈ $0.09 per experiment.

**Not tracked in the app:** experiment spend and the cost cap only count agent cost. The judge
runs inside the verifier container, and its usage is not collected (see `limits.md`).

## Compared with the plan

The plan (§10) estimated about $0.12 per Sonnet trial, assuming about 10 calls with about 15k
tokens of context each. The measured $0.034 is about 3.5× lower, for two reasons: the tasks are
short (a median of 5 tool calls, at most 10), and 88% of input tokens are cache reads.

## What a new experiment costs

12 tasks × 2 configs × 3 repeats with Sonnet 5 costs about **$2.5 for the agent + $0.1 for the
judge**, and takes about 20 minutes.

Each experiment has a cost cap (`costCapUsd`; $15 in E1–E3). If agent spend reaches it, the
Harbor job stops, and the remaining trials stay `pending`.
