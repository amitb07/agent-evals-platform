# Day-1 spike notes (2026-10-18)

> The throwaway spike assets (`spike/`: hand-written Harbor task, job files and home bundles) were
> removed in the cleanup once the worker generated all of them; they are in git history at commit
> `e23872e` (`git show e23872e:spike/job.yaml`).

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

## Verified with the API key (`spike/job.yaml`, `spike/job-memory.yaml`)

| # | Check | Result |
|---|---|---|
| 1 | Two-arm Hermes job (no skill vs. skill) on the smoke task | pass, reward 1.0 both arms, 41 s for 2 trials at concurrency 2 |
| 2 | `-m claude-sonnet-5 --provider anthropic`, `-t terminal,file`, `--skills evals-marker`, `--max-turns` accepted; the skill arm wrote `skill-marker.txt`, the other arm did not; the skill text appears only in the skill arm's system prompt | pass |
| 4 | With memory off, files written under `/opt/data` during the run: `state.db` and locks, `runtime/`, `auth.json`, `installs/`, `cache/`, `logs/`, `spawn-ledger.json`, `SOUL.md`, `skills/.bundled_manifest`. No `memories/`, no new skills, no `pending/` | pass (`home-writes.txt`) |
| 5 | Seeded `memories/MEMORY.md` with `memory_enabled: true`, `write_approval: true`, `memory` toolset enabled: the agent created `memory-marker.txt`; the memory text is in the prompt; nothing written under `memories/` or `pending/` | pass |
| 6 | `hermes sessions export --format jsonl` gives one JSON object with `messages` (assistant `tool_calls` with real ids, verbatim `tool` results), `end_reason`, `estimated_cost_usd`, `cost_status`, `cost_source`, `api_call_count`, `input/output/cache_read/cache_write_tokens`, `system_prompt`, `model_config` | pass |
| 7 | `result.json` carries `n_input_tokens`, `n_cache_tokens`, `n_output_tokens`, `cost_usd` and metadata; `trajectory.json` passes `harbor.utils.trajectory_validator` | pass |
| 10 | Trivial task on Sonnet 5: ~6 s agent time, ~20 s per trial end to end, ~12k tokens of which ~95% cache reads, ≈ $0.006 per trial (Hermes estimate, `cost_status: estimated`) | measured |

Additional facts from the real runs:

- `--usage-file` is wired only to `hermes -z` in v0.22.2. Tokens come from the stream-json `result` event (`tokens.input/output/total/cache_read/cache_write`, `duration_ms`, `exit_code`, `session_id`); cost and `end_reason` come from the session export.
- The image sets `HERMES_WRITE_SAFE_ROOT=/opt/data`, which makes the `write_file` tool refuse `/app`. The adapter sets it to `/app`.
- `/opt/data` is a volume mount point; the adapter empties it with `find -mindepth 1 -delete` before uploading the home bundle.
- `[verifier.environment]` does not inherit `cpus`/`memory_mb` from `[environment]`; under the `limit` policy it needs its own values.
- Stream-json events: `system` (`subtype: init`, `model`, `session_id`), `tool_use` (`name`, `input`), `tool_result` (`name`, `output`, `duration_ms`, `is_error`), `text` (`text`), `result`. All carry `timestamp` in epoch milliseconds.
