# Known limits

Grouped by what they affect. Each is a deliberate scope cut or a finding from the runs, not a
hidden bug.

## What the results can claim

- **Small suite.** 12 tasks × 3 repeats detects only large effects (MDE ≈ 0.32 in E1/E3).
- **Whole-suite estimand dilutes focused effects.** E1 and E3 change behaviour on 3 of 12 tasks.
  Their per-category effects are large and consistent, but the pre-registered suite-level CI
  touches 0 (see `results.md`). Category breakdowns are descriptive only.
- **This suite only.** Offline synthetic tasks; the CI says nothing about Hermes in general.
- **Provider non-determinism.** Repeats of the same config can differ (one task flagged flaky in
  E2). The judge runs without sampling parameters (`claude-opus-5` rejects them).
- **No A/B order randomization.** Both arms interleave under one Harbor scheduler.
- **Memory tested in seeded mode only;** no learn-then-recall loop.

## Grading

- **Judge lightly calibrated:** 12 cases, near-arithmetic rubrics, labels written by the suite's
  author (`judge-calibration.md`). The one judged task in E1–E3 is at the ceiling (18/18 at 1.0).
- **Code checkers can be stricter than intended.** E3 found one: the region report checker
  misread German number formats (fixed, re-graded, disclosed in `results.md`). A review also
  hardened the email greeting check. Other checkers may have similar blind spots.
- **No in-app regrade.** Re-grading stored workspaces is done by hand with the verifier image,
  and corrected statistics come from `pnpm rescore`. The database keeps the recorded scores.
- **One-shot runs score clarifying questions as failures.** Without memory, Hermes sometimes
  asks where to save a file instead of writing it. That is a reasonable behaviour, but there is
  nobody to answer, so it scores 0.

## Cost

- **Judge spend is not metered.** Experiment spend and the cost cap count agent cost only
  (≈ $0.015 per judge call, `costs.md`).
- **Agent cost is Hermes' estimate,** not the provider's invoice.

## Isolation and security

- **Docker is not a strong security boundary;** trusted local use only.
- **The worker holds the host Docker socket** (Harbor starts trial containers through it).
- **Network allowlist:** the agent phase can reach only `api.anthropic.com` through Harbor's
  sidecar. Verified on Docker Desktop (macOS); not tested on Linux Docker.
- **The agent container has the API key in its environment** (Hermes needs it). Ingestion
  redacts it from every stored file and the seed export refuses any file containing a key.

## Platform and versions

- **Docker network pool.** Every trial creates Docker networks. On a machine with many other
  compose projects, Docker Desktop can run out of address pools. Harbor then reports a
  `RuntimeError` (classified `unclassified`, reward invalid, excluded, not retried). Seen once while
  running the e2e test next to the main stack; never in E1–E3.

- **Tested on macOS, Docker Desktop, Apple silicon only.** The pinned Hermes image also has a
  `linux/amd64` variant, which was not exercised.
- **Hermes and Harbor are pinned** (Hermes v0.22.2 by digest, Harbor 0.24.0). Upstream changes need
  a re-run of the oracle, calibration and experiments.
- **One Python file** (the Harbor adapter, `hermes_harbor/`) in a TypeScript codebase.

## Product scope

- No auth, multi-user, CI or cloud deployment.
- No task editor: tasks, configs and experiments are YAML in Git (the UI creates experiments).
- No live streaming: the UI polls every 5 s.
- Light mode only.
