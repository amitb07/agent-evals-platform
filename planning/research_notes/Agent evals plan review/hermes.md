# Hermes Agent plan validation

Research cutoff: October 18, 2026. The source review used current `main` commit [`9e01b44d`](https://github.com/NousResearch/hermes-agent/tree/9e01b44dd23978f9ff40b7837467f3a9f1582130), committed October 18, 2026.

## What exactly is Hermes Agent and how does its agent loop/harness work?

### Takeaway
Hermes Agent is an open-source, model-provider-flexible agent runtime and application, not an evaluation framework. Its shared `AIAgent` core assembles prompts and tools, calls one of three provider API modes, executes requested tools, appends tool results, and repeats until a final response or an iteration/interrupt/failure boundary.

### Cited Findings
- Nous describes Hermes as a “self-improving AI agent” with persistent memory, autonomous skill creation/improvement, session search, multiple terminal backends, messaging gateways, delegation, and batch trajectory generation. The README says it supports Nous Portal, OpenRouter, OpenAI, custom endpoints, and many other providers; “works with any model provider” in the plan should therefore be softened to “supports many providers and OpenAI-compatible/custom endpoints.” — [Official README](https://github.com/NousResearch/hermes-agent/blob/9e01b44dd23978f9ff40b7837467f3a9f1582130/README.md)
- All major entry points—CLI, gateway, ACP, batch runner, API server, and Python library—feed the same `AIAgent` core. The architecture explicitly calls it a platform-agnostic synchronous orchestration engine. — [Architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)
- The loop builds/reuses the system prompt, checks context pressure, formats messages for `chat_completions`, `codex_responses`, or `anthropic_messages`, makes an interruptible model call, executes tool calls, appends their results, and loops; a text response causes persistence and return. Multiple tool calls can execute concurrently, while interactive tools force sequential execution. — [Agent Loop Internals](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop)
- Internally, history uses OpenAI-style system/user/assistant/tool messages. The loop handles retries, fallback providers, compression, prompt caching, cancellation, callbacks, and session persistence. — [Agent Loop Internals](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop)
- The default iteration budget is 500 and is configurable with `agent.max_turns` or the CLI `--max-turns`; delegated child agents receive independent budgets, so total work can exceed the parent’s nominal cap. — [Agent Loop Internals](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop); [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands)
- Skills are progressively disclosed: the index is available at session start, `skill_view` loads a selected skill, and reference files load on demand. Persistent built-in memory consists of `MEMORY.md` and `USER.md`, injected as a frozen snapshot when a session starts. — [Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills); [Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)

### Inferences
- The plan correctly treats Hermes as the system under test rather than the evaluator. However, an eval “turn” can include hidden auxiliary calls, fallback-provider switching, parallel tools, and child-agent iterations, so the trial record must preserve served runtime, auxiliary usage, and child activity rather than treating `maxTurns` as a complete work bound. — [Agent Loop Internals](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop); [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands)

### Gaps
- No official source substantiates the plan’s claimed 2–5 second container startup or “roughly 5% overhead”; benchmark the exact pinned image and host.

## Which proposed integrations are confirmed by official source/docs versus speculative?

### Takeaway
Official support is strong for profiles, explicit model/toolset/skill selection, one-shot and API execution, Docker, structured event output, session history, and usage accounting. The plan overstates profiles as a native eval-config abstraction, overstates Runs SSE as a full transcript, and leaves several performance/capacity estimates unsupported.

### Cited Findings
- A profile is a persistent Hermes home with its own `config.yaml`, `.env`, `SOUL.md`, memories, sessions, skills, cron jobs, and state database. It is not documented as an immutable eval configuration object. — [Profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles)
- The CLI supports per-run `--model`, `--provider`, `--toolsets`, repeatable `--skills`, and `--max-turns`; `--ignore-user-config`, `--ignore-rules`, and `--safe-mode` provide increasingly strong configuration isolation. — [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands)
- Therefore, “Config maps 1:1 to a Hermes profile” is an application design choice, not a Hermes requirement. A profile contains mutable credentials and runtime state as well as configuration, and many proposed config fields can be passed as per-run overrides. — [Profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles); [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands)
- The API server officially exposes OpenAI-compatible Chat Completions and Responses endpoints, asynchronous Runs endpoints, session endpoints, capabilities, health checks, and an API-wide concurrent-run cap (default 10). The Runs API supports idempotent creation, polling, SSE progress, stop, steering, and approvals. — [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server); [Programmatic Integration](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration)
- `GET /v1/runs/{id}` and `run.completed` carry input/output/total/cache-read/cache-write token usage and the provider/model that actually served the turn. This confirms token accounting and fallback attribution. — [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)
- Runs SSE does **not** provide an unabridged transcript: `tool.completed` contains a secret-redacted result preview truncated to 500 characters. The plan’s “transcript from the Runs API event stream” is therefore incorrect if “full transcript” means complete tool arguments and outputs. — [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server); [Runs implementation](https://github.com/NousResearch/hermes-agent/blob/9e01b44dd23978f9ff40b7837467f3a9f1582130/gateway/platforms/api_server_runs.py#L86-L114)
- Full session messages are available through `GET /api/sessions/{id}/messages`; `include_compacted=true` includes turns archived by context compaction. Responses history stores tool output verbatim unless `history_tool_output_max_chars` is configured. — [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)
- `hermes chat --oneshot --format stream-json` emits JSONL `system`, text, tool-use, tool-result, and terminal result events, including exit status, duration, and token counts. Its tool-result output is capped at 5,000 characters, so session storage is still needed for a lossless transcript. — [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands)
- `--usage-file` writes estimated cost, detailed token counts, API calls, runtime identity, completion/failure flags, and separate auxiliary-call accounting, including `total_including_auxiliary`; it is written even on failed runs. This is better-supported cost telemetry than deriving cost only from Runs token fields. — [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands); [one-shot implementation](https://github.com/NousResearch/hermes-agent/blob/9e01b44dd23978f9ff40b7837467f3a9f1582130/hermes_cli/oneshot.py#L23-L87)
- The batch runner processes JSONL prompts in parallel, supports checkpoint/resume, produces ShareGPT-like conversations and tool statistics, and allows per-prompt container image and `cwd`. Its toolset distributions sample each toolset probabilistically, and its documented options are primarily global model/base URL/key/turn settings. — [Batch Processing](https://hermes-agent.nousresearch.com/docs/user-guide/features/batch-processing)
- The official image supports amd64/arm64, keeps the install tree immutable, stores mutable state under `/opt/data`, and exposes the API server on port 8642 when enabled. Exact deployment pinning should use an image digest, not merely a mutable tag. — [Docker](https://hermes-agent.nousresearch.com/docs/user-guide/docker); [Dockerfile](https://github.com/NousResearch/hermes-agent/blob/9e01b44dd23978f9ff40b7837467f3a9f1582130/Dockerfile)

### Inferences
- Confirmed plan integrations: pinned official Docker image, per-run model/provider/toolsets/skills/max-turns, seeded memory files, API Runs/polling, session transcript retrieval, token/cache telemetry, estimated cost, and batch trajectory generation. — [Docker](https://hermes-agent.nousresearch.com/docs/user-guide/docker); [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands); [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)
- Speculative or inaccurate plan claims: profiles are not a 1:1 native `AgentConfig`; Runs SSE alone is not a full transcript; startup of 2–5 seconds, 5% overhead, local concurrency of 4–8, and the proposed $20–50 budget are not Hermes guarantees; a “pinned image tag” is weaker than a digest. — [Profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles); [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server); [Docker](https://hermes-agent.nousresearch.com/docs/user-guide/docker)
- The batch runner is useful prior art or an alternate executor, but it is not an exact fit for A/B trials requiring deterministic per-config skill/tool/memory state because its distribution feature intentionally randomizes toolset inclusion. — [Batch Processing](https://hermes-agent.nousresearch.com/docs/user-guide/features/batch-processing)

### Gaps
- Official docs do not promise that every provider reports accurate token counts or prices; the usage ledger exposes `cost_status`/`cost_source`, so the platform should retain these fields and treat unknown/estimated cost separately. — [one-shot implementation](https://github.com/NousResearch/hermes-agent/blob/9e01b44dd23978f9ff40b7837467f3a9f1582130/hermes_cli/oneshot.py#L23-L41)

## Can auto skill creation and memory writes be disabled reliably?

### Takeaway
Yes, but “self-learning OFF” must be expressed as several explicit controls. Memory can be removed from the schema, automatic post-turn review can be disabled, and skill writes can be prevented or staged; write approval alone is not equivalent to a mutation-free trial because it creates pending state.

### Cited Findings
- Setting both `memory.memory_enabled: false` and `memory.user_profile_enabled: false` removes the built-in memory tool and its prompt guidance. Adding `memory` to `agent.disabled_toolsets` is stronger because it also hides external-memory-provider tools. — [Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)
- `memory.write_approval: true` gates both foreground and background-review writes, but noninteractive writes are staged under pending state rather than discarded. It prevents approved memory changes from landing but still mutates the trial home. — [Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)
- `auxiliary.background_review.enabled: false` disables automatic post-turn self-improvement forks; finite one-shot CLI turns also suppress automatic review in current source. — [Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory); [background-review source](https://github.com/NousResearch/hermes-agent/blob/9e01b44dd23978f9ff40b7837467f3a9f1582130/agent/background_review.py#L228-L250)
- The `skills` toolset contains `skill_manage`, `skill_view`, and `skills_list`; disabling that toolset prevents autonomous skill CRUD but also removes dynamic skill browsing. — [Toolsets reference](https://hermes-agent.nousresearch.com/docs/reference/toolsets-reference)
- `skills.write_approval: true` stages every skill write under `pending/skills`; it does not make the home read-only. External skill directories are explicitly not a write-protection boundary if writable by Hermes. — [Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
- Profiles are seeded with bundled skills by default. `hermes profile create --no-skills` or `hermes skills opt-out` prevents future bundled-skill seeding, with `--remove` needed to remove unmodified skills already present. — [Profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles); [Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)

### Inferences
- For a strict no-learning trial, use a fresh home plus `auxiliary.background_review.enabled: false`, `agent.disabled_toolsets: [memory, skills]`, both built-in memory stores disabled, no external memory provider, and no writable shared skill directories. Preload the evaluated skill with `--skills` so its text enters the prompt while the `skills` toolset remains unavailable; current one-shot code loads preselected skills separately from toolset selection. — [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands); [one-shot implementation](https://github.com/NousResearch/hermes-agent/blob/9e01b44dd23978f9ff40b7837467f3a9f1582130/hermes_cli/oneshot.py#L110-L140)
- If tests require `skill_view`, use `skills.write_approval: true`, mount seeded skill content read-only, and discard the entire trial home afterward; expect attempted writes to appear as staged operations or errors in the trajectory. — [Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
- The plan’s single boolean `memory.mode: off` is too coarse unless the config compiler expands it into all relevant built-in and external-provider controls. — [Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)

### Gaps
- There is no documented single `self_learning: false` switch covering memory, foreground skill management, background review, external memory plugins, and other writable plugins.

## What is the best supported headless interface for one isolated trial?

### Takeaway
For a fresh container per trial, the best-supported interface is `hermes chat --oneshot --format stream-json` plus `--usage-file`, with a unique session/home and post-run session export. `hermes -z` is simpler but intentionally returns only final text; the Runs API is preferable when reattachment, cancellation, or a long-lived gateway matters.

### Cited Findings
- `hermes chat --oneshot --format stream-json` is explicitly documented for CI runners and orchestrators, gives structured lifecycle/tool events and a terminal exit record, and accepts model, provider, toolset, skill, and turn-limit overrides. — [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands)
- `hermes -z` is documented as the “purest one-shot” but intentionally emits final response text only; docs direct users needing tool transcript output to `hermes chat --oneshot -q`. — [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands)
- `--usage-file` works for `-z` and `--oneshot`, reports main and auxiliary usage/cost, and is written on failures. — [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands)
- Runs API is designed for long-form work with polling, reconnectable SSE, durable idempotency, and control endpoints. It requires an enabled gateway/API server and its SSE tool outputs are previews, not full artifacts. — [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)
- The official Docker entrypoint supports passing commands directly, including `chat -q`, and the image’s mutable state is isolated under `/opt/data`. — [Dockerfile](https://github.com/NousResearch/hermes-agent/blob/9e01b44dd23978f9ff40b7837467f3a9f1582130/Dockerfile#L510-L543); [Docker](https://hermes-agent.nousresearch.com/docs/user-guide/docker)

### Inferences
- Recommended trial flow: launch one pinned-digest container with a fresh `/opt/data` and task workspace; invoke one-shot JSONL with explicit model/toolsets/skills/max-turns and a usage file; capture stdout/stderr/exit code; retrieve full session messages using the emitted session ID or copy the session database before deleting the container; grade the separate workspace. — [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands); [Session Storage](https://hermes-agent.nousresearch.com/docs/developer-guide/session-storage)
- Do not start the API server inside every short-lived trial unless the orchestration requirements need its detach/reconnect/stop semantics; doing so adds gateway lifecycle and authentication without improving full transcript fidelity. — [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)

### Gaps
- The docs do not provide an official end-to-end eval recipe combining one-shot JSONL, usage-file output, and lossless session export; this must be validated in the Day-1 spike.

## What runtime state and credentials must be isolated or mounted?

### Takeaway
Each trial needs a unique writable Hermes home and workspace. Only immutable seeded configuration/skills/memory and required credentials should be copied or mounted in; no writable Hermes home, session database, workspace, or OAuth token store should be shared concurrently.

### Cited Findings
- `HERMES_HOME` is the authoritative state resolver. Named profiles have separate config, logs, state database, memories, sessions, skills, cron jobs, and related state; subprocesses must preserve `HERMES_HOME` or they can fall back into the wrong profile. — [Session Storage](https://hermes-agent.nousresearch.com/docs/developer-guide/session-storage)
- In Docker, `/opt/data` is the source of truth for `.env`, `config.yaml`, `SOUL.md`, sessions, memories, skills, per-profile subprocess home, cron, hooks, logs, and other mutable state; `state.db` also lives there. — [Docker](https://hermes-agent.nousresearch.com/docs/user-guide/docker)
- The official docs warn never to run two gateways or containers against the same data directory. On macOS/Windows VM-crossing bind mounts, SQLite WAL can corrupt; a native Docker named volume or `database.journal_mode: delete` is recommended. — [Docker](https://hermes-agent.nousresearch.com/docs/user-guide/docker)
- Static API keys may live in profile `.env` or be injected with container environment variables. OAuth credentials can fall back to root `auth.json`, and copied single-use refresh tokens are unsafe because refresh by one owner invalidates the other. — [Profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles); [Docker](https://hermes-agent.nousresearch.com/docs/user-guide/docker)
- A profile is not a workspace or sandbox: terminal starting directory is separately controlled by `terminal.cwd`. Separate containers are recommended when resource isolation, image pinning, network segmentation, or credential blast-radius separation is required. — [Profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles); [Docker](https://hermes-agent.nousresearch.com/docs/user-guide/docker)

### Inferences
- Isolate per trial: `/opt/data`/`HERMES_HOME`, `state.db` and sidecars, `sessions/`, `memories/`, `skills/`, `pending/`, `home/`, `logs/`, hooks/plugins/config state, and the task workspace. Container filesystem/process/network/resource limits—not profiles—provide the required hostile-task isolation. — [Docker](https://hermes-agent.nousresearch.com/docs/user-guide/docker); [Profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles)
- Mount or inject: a generated config, selected skill snapshot, optional seeded memory, task fixtures/workspace, and provider/tool credentials. Prefer ephemeral environment/secret injection over copying a developer’s full `.env` or OAuth `auth.json`; ensure transcript/artifact redaction because tools can still read mounted secrets. — [Docker](https://hermes-agent.nousresearch.com/docs/user-guide/docker); [Profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles)
- The plan’s fresh-container design is justified for reproducibility and security, but “fresh container guarantees a clean start” is true only if the Hermes home and workspace are also fresh and no external memory/plugin/backend persists state. — [Session Storage](https://hermes-agent.nousresearch.com/docs/developer-guide/session-storage); [Memory providers](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers)

### Gaps
- Network egress policy, Linux capabilities, seccomp/AppArmor, PID/process limits, and credential-broker design are platform responsibilities; Hermes profiles do not establish those boundaries.
