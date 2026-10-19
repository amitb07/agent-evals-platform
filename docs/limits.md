# Known limits

These limits are grouped by what they affect. Each one is either a deliberate choice to keep the
scope small or something we learned from the runs. None of them is a hidden bug.

## What the results can claim

- **The suite is small.** 12 tasks × 3 repeats can only detect large effects (MDE ≈ 0.32 in E1
  and E3).
- **Averaging over the whole suite hides focused effects.** E1 and E3 change behaviour on only 3
  of 12 tasks. On those tasks the effect is large and consistent, but the planned suite-level CI
  still touches 0 (see `results.md`). Results per category are descriptive only.
- **The results apply to this suite only.** The tasks are offline and synthetic. The CI says
  nothing about Hermes in general.
- **The model is not fully predictable.** Repeats of the same config can give different results
  (one task was flagged as flaky in E2). The judge runs without sampling parameters, because
  `claude-opus-5` does not accept them.
- **A and B are not run in random order.** Both arms are mixed together by one Harbor scheduler.
- **Memory is only tested in seeded mode.** We do not test the agent learning something and
  recalling it later.

## Grading

- **The judge is only lightly calibrated.** There are 12 cases with rubrics that are close to
  simple counting, and the labels were written by the suite's author (`judge-calibration.md`).
  The one judged task in E1–E3 is already at the maximum (18 of 18 trials at 1.0).
- **Code checks can be stricter than intended.** E3 found one case: the region report checker
  misread German number formats. It was fixed, the trials were re-graded, and this is disclosed
  in `results.md`. A review also made the email greeting check more robust. Other checkers may
  have similar blind spots.
- **There is no re-grading in the app.** Stored workspaces are re-graded by hand with the
  verifier image, and corrected statistics come from `pnpm rescore`. The database keeps the
  original scores.
- **In one-shot runs, a clarifying question counts as a failure.** Without memory, Hermes
  sometimes asks where to save a file instead of writing it. That is a reasonable thing to do,
  but nobody is there to answer, so it scores 0.

## Cost

- **Judge spend is not tracked.** Experiment spend and the cost cap only count agent cost (about
  $0.015 per judge call, see `costs.md`).
- **Agent cost is Hermes' estimate,** not the provider's invoice.

## Isolation and security

- **Docker is not a strong security boundary.** Please use this only on a trusted local machine.
- **The worker has access to the host's Docker socket,** because Harbor starts trial containers
  through it.
- **Network allowlist.** During the agent phase, the agent can only reach `api.anthropic.com`,
  through Harbor's sidecar. This was verified on Docker Desktop (macOS), but not on Linux Docker.
- **The agent container has the API key in its environment,** because Hermes needs it. The key is
  removed from every stored file, and the seed export refuses any file that contains a key.

## Platform and versions

- **Docker network pool.** Every trial creates Docker networks. On a machine with many other
  compose projects, Docker Desktop can run out of address pools. Harbor then reports a
  `RuntimeError`. The trial is classified as `unclassified`, its reward is invalid, and it is
  excluded and not retried. This happened once, while running the e2e test next to the main
  stack. It never happened in E1–E3.
- **Only tested on macOS with Docker Desktop on Apple silicon.** The pinned Hermes image also has
  a `linux/amd64` version, which was not tried.
- **Hermes and Harbor are pinned** (Hermes v0.22.2 by digest, Harbor 0.24.0). After an upstream
  update, the oracle, the calibration and the experiments need to be run again.
- **There is one Python file** (the Harbor adapter in `hermes_harbor/`) in a TypeScript codebase.

## Product scope

- No login, no multiple users, no CI and no cloud deployment.
- No task editor. Tasks, configs and experiments are YAML files in Git. (The UI can create
  experiments and skill configs.)
- No live streaming. The UI checks for updates every 5 s.
- Light mode only.
