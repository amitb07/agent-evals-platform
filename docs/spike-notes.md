# Day-1 spike notes (2026-10-18)

On day 1 we ran a short spike to check that Hermes and Harbor work together as planned, before
building the platform. These notes record what we checked and what we learned.

> The temporary spike files (`spike/`: a hand-written Harbor task, job files and home bundles)
> were removed once the worker could generate all of them. You can still find them in git
> history at commit `e23872e`, for example with `git show e23872e:spike/job.yaml`.

## Pinned versions

| Component | Value |
|---|---|
| Hermes image | `nousresearch/hermes-agent@sha256:36099926da316742423544e055d4734777105ffe6341873af5459b957d0c2919` (Hermes v0.22.2, arm64) |
| Runner image | `evals/hermes-runner:spike`, built from `docker/hermes/Dockerfile` |
| Harbor | 0.24.0, installed with `uv tool install 'harbor>=0.24,<0.25' --python 3.12` |
| Docker | 29.8.2, Docker Desktop, linux/aarch64 |

## Checked without an API key

| # | Check | Result |
|---|---|---|
| 1a | Harbor hello-world with the oracle agent on Docker | pass, 48 s |
| 1b | Smoke task (`spike/tasks/smoke`) with the oracle agent: Hermes-based image, `[agent] user = "hermes"`, separate Alpine verifier, `/app` files passed to the verifier, reward 1.0 | pass, 25 s |
| 1c | Dry run of `spike/job.yaml` with two `HermesAgent` arms and their settings | pass, 2 trials resolved |
| 3 | The Hermes CLI, run as uid 10000 with a fresh `HERMES_HOME`, creates an empty `skills/`. (Built-in skills are only copied in by the s6 entrypoint that runs as root, and Harbor's `docker exec` skips it.) | pass; the adapter still empties `/opt/data` and uploads the bundle with `.no-bundled-skills` |
| 8 | Network allowlist for the agent phase on Docker Desktop: `api.anthropic.com` → HTTP 404 (reachable), `example.com` → blocked | pass (`hermes_harbor/fake_agent.py`) |
| 9 | The separate verifier never sees the agent container, and the checks live in the verifier image | pass by design (oracle run) |

## Facts that changed the implementation

**Hermes CLI**

- In Hermes v0.22.2, `--usage-file`, `-m`, `--provider`, `-t`, `--skills`, `--yolo` and `--in`
  are **top-level** `hermes` flags. `--max-turns`, `--query-file`, `--oneshot` and `--format`
  belong to `chat`. So the command looks like:
  `hermes <top flags> chat --query-file … --oneshot --format stream-json --max-turns N`.
- Hermes expects `ANTHROPIC_API_KEY`, and the provider name is `anthropic`. Toolset names include
  `terminal`, `file`, `code_execution`, `skills`, `memory`, `web`, `browser`, `delegation`,
  `session_search` and `cronjob`.
- Config keys confirmed in `hermes_cli/config_defaults.py`: `agent.max_turns`,
  `agent.disabled_toolsets`, `memory.memory_enabled`, `memory.user_profile_enabled`,
  `memory.write_approval`, `auxiliary.background_review.enabled`, `skills.write_approval`,
  `database.journal_mode`, `terminal.cwd`. The marker file is `.no-bundled-skills`.
- Session export command: `hermes sessions export --format jsonl --yes --session-id <id> <output>`.

**Harbor**

- The Harbor 0.24.0 API differs from `main`. Credentials are set with
  `ModelConnectionSpec(default_provider="anthropic", api_key_envs=("ANTHROPIC_API_KEY",))` and
  read with `self.model_connection.api_key`. Custom `--ak` settings need an `options_model` that
  subclasses `InstalledAgentOptions`.
- Harbor runs every container command through `bash -c`, so verifier images must include bash.
- Harbor resolves a relative `-o` jobs folder against the verifier's compose project folder, and
  then the file upload fails. Please always pass an absolute path to `-o`.
- In `task.toml`, root keys such as `artifacts` must come before the first table header.
  Otherwise TOML puts them inside that table.
- Harbor keeps the container alive with `sleep infinity`, but the Hermes s6 entrypoint still
  copies its defaults into `/opt/data` first. That is why the adapter empties `/opt/data` before
  uploading the home bundle.
- Our Harbor adapter package is called `hermes_harbor` (import path
  `hermes_harbor.hermes_agent:HermesAgent`), because `harbor` is already Harbor's own package
  name. Run it with `PYTHONPATH=<repo root>`.

## Checked with the API key (`spike/job.yaml`, `spike/job-memory.yaml`)

| # | Check | Result |
|---|---|---|
| 1 | Two-arm Hermes job (no skill vs. skill) on the smoke task | pass, reward 1.0 in both arms, 41 s for 2 trials at concurrency 2 |
| 2 | `-m claude-sonnet-5 --provider anthropic`, `-t terminal,file`, `--skills evals-marker` and `--max-turns` are accepted. The skill arm wrote `skill-marker.txt` and the other arm did not. The skill text appears only in the skill arm's system prompt. | pass |
| 4 | With memory off, these were the files written under `/opt/data` during the run: `state.db` and locks, `runtime/`, `auth.json`, `installs/`, `cache/`, `logs/`, `spawn-ledger.json`, `SOUL.md`, `skills/.bundled_manifest`. No `memories/`, no new skills, no `pending/`. | pass (`home-writes.txt`) |
| 5 | Seeded `memories/MEMORY.md` with `memory_enabled: true`, `write_approval: true` and the `memory` toolset on: the agent created `memory-marker.txt`, the memory text is in the prompt, and nothing was written under `memories/` or `pending/` | pass |
| 6 | `hermes sessions export --format jsonl` gives one JSON object with `messages` (assistant `tool_calls` with real ids, `tool` results word for word), `end_reason`, `estimated_cost_usd`, `cost_status`, `cost_source`, `api_call_count`, `input/output/cache_read/cache_write_tokens`, `system_prompt` and `model_config` | pass |
| 7 | `result.json` contains `n_input_tokens`, `n_cache_tokens`, `n_output_tokens`, `cost_usd` and metadata; `trajectory.json` passes `harbor.utils.trajectory_validator` | pass |
| 10 | Trivial task on Sonnet 5: about 6 s of agent time, about 20 s per trial in total, about 12k tokens of which about 95% are cache reads, ≈ $0.006 per trial (Hermes estimate, `cost_status: estimated`) | measured |

More facts from the real runs:

- In v0.22.2, `--usage-file` only works with `hermes -z`. So token counts come from the
  stream-json `result` event (`tokens.input/output/total/cache_read/cache_write`, `duration_ms`,
  `exit_code`, `session_id`), and cost and `end_reason` come from the session export.
- The image sets `HERMES_WRITE_SAFE_ROOT=/opt/data`, which makes the `write_file` tool refuse to
  write to `/app`. The adapter sets it to `/app`.
- `/opt/data` is a volume mount point. The adapter empties it with `find -mindepth 1 -delete`
  before uploading the home bundle.
- `[verifier.environment]` does not inherit `cpus` and `memory_mb` from `[environment]`. Under the
  `limit` policy it needs its own values.
- Stream-json event types: `system` (`subtype: init`, `model`, `session_id`), `tool_use` (`name`,
  `input`), `tool_result` (`name`, `output`, `duration_ms`, `is_error`), `text` (`text`) and
  `result`. All of them carry a `timestamp` in epoch milliseconds.
