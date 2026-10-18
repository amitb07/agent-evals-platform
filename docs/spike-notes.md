# Day-1 spike notes (2026-10-18)

## Pinned versions

| Component | Value |
|---|---|
| Hermes image | `nousresearch/hermes-agent@sha256:36099926da316742423544e055d4734777105ffe6341873af5459b957d0c2919` (Hermes v0.22.2, arm64) |
| Runner image | `evals/hermes-runner:spike` built from `docker/hermes/Dockerfile` |
| Harbor | 0.24.0 via `uv tool install 'harbor>=0.24,<0.25' --python 3.12` |
| Docker | 29.8.2, Docker Desktop, linux/aarch64 |

## Verified without an API key

| # | Check | Result |
|---|---|---|
| 1a | Harbor hello-world with the oracle agent on Docker | pass, 48 s |
| 1b | Smoke task (`spike/tasks/smoke`) with oracle: Hermes-based image, `[agent] user = "hermes"`, separate Alpine verifier, `/app` artifact transfer, reward 1.0 | pass, 25 s |
| 1c | Dry-run of `spike/job.yaml` with two `HermesAgent` arms and kwargs | pass, 2 trials resolved |
| 3 | Hermes CLI as uid 10000 with a fresh `HERMES_HOME` creates an empty `skills/` (seeding only happens in the root-time s6 entrypoint, which Harbor's `docker exec` bypasses) | pass; the adapter still wipes `/opt/data` and uploads the bundle with `.no-bundled-skills` |
| 8 | Agent-phase allowlist on Docker Desktop: `api.anthropic.com` → HTTP 404, `example.com` → blocked | pass (`hermes_harbor/fake_agent.py`) |
| 9 | Separate verifier never sees the agent container; checks live in the verifier image | pass by construction (oracle run) |

## Facts that changed the implementation

- In Hermes v0.22.2 `--usage-file`, `-m`, `--provider`, `-t`, `--skills`, `--yolo`, `--in` are **top-level** `hermes` flags; `--max-turns`, `--query-file`, `--oneshot`, `--format` belong to `chat`. Command shape: `hermes <top flags> chat --query-file … --oneshot --format stream-json --max-turns N`.
- Hermes expects `ANTHROPIC_API_KEY`; provider name `anthropic`; toolset names include `terminal`, `file`, `code_execution`, `skills`, `memory`, `web`, `browser`, `delegation`, `session_search`, `cronjob`.
- Config keys confirmed in `hermes_cli/config_defaults.py`: `agent.max_turns`, `agent.disabled_toolsets`, `memory.memory_enabled`, `memory.user_profile_enabled`, `memory.write_approval`, `auxiliary.background_review.enabled`, `skills.write_approval`, `database.journal_mode`, `terminal.cwd`. Marker file `.no-bundled-skills`.
- `hermes sessions export --format jsonl --yes --session-id <id> <output>`.
- Harbor 0.24.0 API differs from `main`: credentials via `ModelConnectionSpec(default_provider="anthropic", api_key_envs=("ANTHROPIC_API_KEY",))` and `self.model_connection.api_key`; custom `--ak` kwargs need an `options_model` subclass of `InstalledAgentOptions`.
- Harbor runs every container command through `bash -c`: verifier images must contain bash.
- Harbor resolves a relative `-o` jobs dir against the verifier compose project directory and fails artifact upload: always pass an absolute `-o`.
- In `task.toml`, root keys such as `artifacts` must appear before the first table header or TOML assigns them to that table.
- Harbor keeps the container alive with `sleep infinity`; the Hermes s6 entrypoint still runs its root-time seeding into `/opt/data` first. The adapter wipes `/opt/data` before uploading the home bundle.
- Our Harbor adapter package is `hermes_harbor` (import path `hermes_harbor.hermes_agent:HermesAgent`) because `harbor` is Harbor's own package name. Run with `PYTHONPATH=<repo root>`.

## Pending (need `ANTHROPIC_API_KEY`)

Checks 1 (real Hermes trial under Harbor), 2 (model, toolsets, skills, max-turns take effect), 4 (no writes with memory off), 5 (seeded memory visible), 6 (session export, usage.json fields), 7 (tokens and cost in `result.json`, valid `trajectory.json`), 10 (timings and cost per trial).
