# Costs

All numbers were measured on 2026-10-18/19. Agent cost is Hermes' own per-session estimate
(`estimated_cost_usd` from `hermes sessions export`, `cost_status: estimated`), not an invoice.

## What was spent

| Item | Trials or calls | Cost |
|---|---|---|
| E1 skills, agent | 72 trials | $2.24 |
| E2 tools, agent | 72 trials | $2.72 |
| E3 memory, agent | 72 trials | $2.43 |
| Smoke run (step 18), agent | 4 trials | $0.08 |
| Day-1 spike, agent | a handful of trivial trials (≈ $0.006 each) | < $0.10 |
| Judge (`claude-opus-5`): E1–E3, smoke, oracle runs, calibration, injection checks | ≈ 50 calls × $0.015 | ≈ $0.75 |
| **Total** | | **≈ $8.3** |

The budget was $20–50. Local infrastructure (Docker Desktop on a laptop) cost nothing extra.

## Per trial (E1–E3, 216 trials, `claude-sonnet-5`)

| Measure | Value |
|---|---|
| Mean agent cost | **$0.034** (min $0.010, max $0.256) |
| Mean tokens in / out | 34.8k / 1.7k, of which 30.5k (88%) are cache reads |
| Mean trial duration (agent + verifier, end to end) | 61 s |
| Experiment wall clock (72 trials, concurrency 4) | 17–20 min |

By task category:

| Category | Mean cost | Mean duration |
|---|---|---|
| tools | $0.017 | 45 s |
| memory | $0.020 | 48 s |
| open | $0.023 | 52 s |
| coding | $0.036 | 84 s |
| skill | $0.069 | 78 s |

The skill tasks cost the most when the skill is missing: the baseline searches for a format to
copy (E1 arm A $0.076 vs arm B $0.027 per skill trial).

## Judge

One judge call on `open-docs-onboarding` used 1,061 input and 392 output tokens (83 of them
thinking), **≈ $0.015** at $5 / $25 per million tokens. Only tasks with an `llm_judge` grader
call it, and only when every gate passed. In E1–E3 that is one task: 18 calls per three
experiments, ≈ $0.09 per experiment.

**Not metered in the app:** experiment spend and the cost cap count agent cost only. The judge
runs inside the verifier container and its usage is not ingested (see `limits.md`).

## Compared with the plan

The plan (§10) estimated about $0.12 per Sonnet trial, assuming ~10 calls of ~15k context each.
The measured $0.034 is about 3.5× lower: the tasks are short (median 5 tool calls, at most 10) and
88% of input tokens are cache reads.

## What a new experiment costs

12 tasks × 2 configs × 3 repeats with Sonnet 5 ≈ **$2.5 agent + $0.1 judge**, about 20 minutes.
The per-experiment cap (`costCapUsd`, $15 in E1–E3) stops the Harbor job if agent spend reaches
it; remaining trials stay `pending`.
