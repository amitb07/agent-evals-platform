# Agent Evals Platform — Approach

**Goal of the assignment, in one line:** when we change something about an agent (model, skill, memory, tools), we want evidence — not a feeling — that it got better, worse, or stayed the same.

This document explains how the prototype answers that question, how it works end to end, and what we are deliberately leaving out.

---

## 1. The core idea in plain words

An eval is just a controlled experiment:

1. Write down a set of **tasks** and, for each, a precise rule for **how to score it**.
2. Write down the **agent configurations** you want to compare (A = "Haiku, no memory", B = "Sonnet, no memory", for example).
3. Run **every task under every configuration**, several times each, because agents are not deterministic.
4. Compare configuration B against A **task by task**, and report not just "B scored 70% vs 60%" but **how sure we are** that B is really better.
5. Let a person open any single run and see **what the agent actually did** — every tool call, every output — so a failure can be understood, not just counted.

Everything in the platform exists to support one of those five steps.

```
   Tasks  ──┐
            ├──►  Runner  ──►  Runs (trajectory + score)  ──►  Stats  ──►  Verdict + evidence
 Configs  ──┘        │                                             │
                     │                                             └──►  "B better / A better /
                     └──►  Hermes Agent (real) or Mock (offline)          inconclusive, need N more"
```

---

## 2. How each step works

### 2.1 Tasks and scoring

A task is a prompt plus a scoring rule. Tasks live as YAML in `samples/tasks/` and can also be created in the UI.

```yaml
id: csv-dedupe
name: Remove duplicate rows from a CSV
category: files            # files | extraction | reasoning | writing
prompt: |
  The file customers.csv contains duplicate rows. Write a de-duplicated copy
  to customers.clean.csv, keeping the first occurrence of each email.
setup:                      # files placed in the run's workspace before the agent starts
  - path: customers.csv
    content: |
      email,name
      a@x.com,Ann
      b@x.com,Bob
      a@x.com,Ann
graders:                    # several allowed; weighted average = task score (0..1)
  - type: command           # runs in the workspace after the agent finishes; exit 0 = pass
    weight: 1
    params:
      run: 'test "$(wc -l < customers.clean.csv)" -eq 3'
timeout_seconds: 300
```

Grader types (all pluggable, all produce a 0–1 score and an explanation):

| Grader | What it checks | Good for |
|---|---|---|
| `exact_match` | final answer equals the expected string | short factual answers |
| `contains` | final answer contains all required snippets | lists, multi-part answers |
| `regex` | final answer matches a pattern | numbers, IDs, formats |
| `json_schema` | final answer is JSON matching a schema | structured extraction |
| `command` | a shell check run inside the workspace exits 0 | any task that changes files — the most reliable grader for agent work |
| `llm_judge` | a separate, fixed model scores the answer against a rubric | writing quality, summaries, explanations |

A task **passes** when its weighted score ≥ 0.5 (configurable per task). We keep both the raw score and the pass/fail flag; pass rates are what the comparison statistics use.

### 2.2 Agent configurations

A configuration is everything about the agent that we might want to vary. All four dimensions in the brief are first-class fields:

```yaml
id: sonnet-with-skill
name: Sonnet + csv skill
model: claude-sonnet-4-5          # any model Hermes can reach
provider: anthropic
toolsets: [terminal, file]        # Hermes toolsets to enable (empty = Hermes default)
skills: [csv-hygiene]             # skills preloaded into the session
memory:
  enabled: true
  seed: |                         # optional: pre-populated memory the agent starts with
    The user prefers Python for data work.
max_turns: 30
```

**How a config becomes a running Hermes agent.** Hermes keeps all of its state (config, memory, skills) in one directory, selected by the `HERMES_HOME` environment variable. So for each configuration the platform generates an isolated Hermes home directory:

```
data/profiles/sonnet-with-skill/
├── config.yaml      ← memory on/off, terminal backend = docker, turn limits
├── .env             ← ANTHROPIC_API_KEY copied from the platform's environment
├── memories/MEMORY.md   ← the memory seed (if any)
└── skills/csv-hygiene/  ← skills copied from this repo's hermes/skills/
```

Then each run is one process call, using Hermes's documented non-interactive mode:

```
HERMES_HOME=data/profiles/sonnet-with-skill \
hermes chat --oneshot -q "<task prompt>" --format stream-json \
  --model claude-sonnet-4-5 --provider anthropic \
  --toolsets terminal,file --skills csv-hygiene --max-turns 30 --yolo
```

Hermes prints one JSON object per line: `init`, `text`, `tool_use`, `tool_result`, and a final `result` with token counts, duration and exit code. The platform stores all of it as the run's **trajectory**. No changes to Hermes source are needed.

Each run gets its own temporary **workspace** folder (seeded with the task's setup files). Hermes is configured to use its **Docker terminal backend** with the workspace mounted, so the agent's shell commands run inside a container, not on the host. Graders then inspect the workspace afterwards.

### 2.3 Running an experiment

An experiment = a task set × a list of configurations × a number of trials.

- Total runs = tasks × configs × trials (e.g. 12 × 2 × 3 = 72).
- Runs are queued and executed with bounded concurrency (default 2 for real Hermes, to respect rate limits and Docker; 8 for mock).
- Each run records: status, trajectory, final answer, grader results, score, pass/fail, tokens, estimated cost, wall-clock time, tool-call count, and any error.
- The UI polls progress; you can watch runs complete and open any of them immediately.

### 2.4 Comparing configurations — the statistics, explained simply

Agents are noisy. Two runs of the same task can pass and fail for no reason other than sampling. So a bare "70% vs 60%" is not evidence. The platform reports three things:

1. **Pass rate with a confidence interval** for each configuration (Wilson interval). "B: 70% (95% CI 55–82%)" tells you the plausible range, not a single number.

2. **Paired difference.** Because every task was run under both configurations, we compare them **on the same task and same trial index**, which cancels out the noise from "some tasks are just hard". We compute the per-task difference, average it, and bootstrap a 95% confidence interval on that average. We also report **P(B > A)** — the fraction of bootstrap resamples where B came out ahead — as an easy-to-read probability.

3. **A plain-language verdict**, chosen by a simple rule:
   - CI entirely above 0 → **"B is better"**
   - CI entirely below 0 → **"A is better"**
   - CI straddles 0 → **"Inconclusive — about N more trials per task would be needed to tell"** (N estimated from the observed variance)

Alongside the win/loss view we show **pass@k** (did any of the k trials pass? — the ceiling of what the agent *can* do) and **pass^k** (did *all* k trials pass? — how *reliable* it is), plus deltas in cost, tokens, latency and tool calls. A config that is 5 points better but 3× the cost should look like exactly that.

### 2.5 Inspecting a run

The run page is where "why did it fail?" gets answered:

- The task prompt and the final answer side by side
- A timeline of every tool call with its input, output, duration and errors
- Each grader's score and its explanation (e.g. "command exited 1: customers.clean.csv not found")
- Token usage and cost for that run
- Raw JSONL and stderr for anyone who wants the unfiltered record
- A link to jump to the **same task under the other configuration** — the fastest way to see what the better agent did differently

---

## 3. Architecture

```
┌──────────────────────── Vue 3 + TypeScript (apps/web) ────────────────────────┐
│  Tasks   Configs   New experiment   Comparison (verdict, paired plot)   Run    │
└───────────────────────────────┬────────────────────────────────────────────────┘
                                │ REST (JSON)
┌───────────────────────────────▼─────── NestJS + TypeScript (apps/api) ────────┐
│  tasks/  configs/  experiments/  runs/  stats/          ← thin CRUD + queries  │
│  runner/   ──  queue (bounded concurrency)                                     │
│     ├── HermesRunner   spawns `hermes chat --oneshot --format stream-json`     │
│     └── MockRunner     replays fixtures — lets the whole platform run offline  │
│  graders/  exact_match · contains · regex · json_schema · command · llm_judge │
│  stats/    Wilson CI · paired bootstrap · P(B>A) · pass@k · pass^k · cost     │
│  SQLite (one file, zero setup)      data/runs/<id>/workspace (per run)        │
└────────────────────────────────────────────────────────────────────────────────┘
                                │
                     Hermes Agent CLI  →  Docker terminal backend  →  Anthropic API
```

**Why these choices**

| Decision | Why |
|---|---|
| Drive Hermes through its CLI, not its Python internals | Documented contract (`--format stream-json`), survives Hermes upgrades, zero source changes, trivially swappable for another agent later |
| One Hermes home directory per configuration | Memory and skills are *stored state*; isolating them per config is the only way "memory on vs off" means anything |
| SQLite, not Postgres | "Runs locally with a single command" — no DB server to install. Schema is plain SQL and would port to Postgres unchanged |
| Mock runner is first-class | The platform must be demoable and testable without API keys or Hermes installed; the real runner and the mock implement the same interface |
| Graders run on the host against the workspace | Deterministic, fast, and independent of what the agent *claims* it did |
| Paired statistics, not independent averages | Paired comparison roughly halves the number of trials needed for the same confidence; it is the single most important methodological choice in the platform |
| LLM judge is a separate, fixed, cheap model | The judge must not change between configurations, or you are measuring the judge |

---

## 4. Repository layout

```
agent-evals/
├── run.sh                 ← the single command: installs, builds, seeds, starts on :3000
├── apps/api/              ← NestJS backend (serves the built frontend too)
├── apps/web/              ← Vue 3 frontend
├── packages/shared/       ← types + validation schemas shared by both
├── samples/
│   ├── tasks/*.yaml       ← the sample task set (12 tasks, 4 categories)
│   ├── configs/*.yaml     ← sample configurations covering model / skill / memory / tools
│   └── fixtures/          ← recorded trajectories the mock runner replays
├── hermes/skills/         ← skills this repo ships for the "skill on/off" comparison
├── scripts/
│   ├── preflight.sh       ← checks node, hermes, docker, API key; prints what's missing
│   └── run-real-experiment.ts  ← runs the headline experiment against real Hermes
└── docs/
    ├── APPROACH.md        ← this file
    ├── DESIGN.md          ← architecture + key decisions (deliverable 2)
    ├── LIMITATIONS.md     ← known limits (deliverable 3)
    ├── COSTS.md           ← cost model and numbers (deliverable 4)
    ├── EXPERIMENT.md      ← results of the real experiment (deliverable 5)
    └── VIDEO.md           ← shot list for the demo video (deliverable 6)
```

---

## 5. The sample task set and the headline experiment

**12 tasks, chosen so every grader type and every config dimension gets exercised:**

| Category | Count | Graded by | Exercises |
|---|---|---|---|
| Files & terminal (dedupe CSV, fix a failing test, rename files by rule) | 4 | `command` | tools, skills |
| Structured extraction (invoice → JSON, log → counts) | 3 | `json_schema`, `exact_match`, `regex` | model quality |
| Reasoning / Q&A with a catch | 2 | `exact_match`, `contains` | model quality |
| Memory-dependent (needs a fact only present in seeded memory) | 1 | `contains` | memory on/off |
| Writing (summary, commit message) | 2 | `llm_judge` | model quality |

**Sample configurations** (all runnable with the mock runner; the real ones need your key):

- `haiku-base` — small model, default tools, memory off
- `sonnet-base` — larger model, default tools, memory off
- `sonnet-skill` — `sonnet-base` + the `csv-hygiene` skill
- `sonnet-memory` — `sonnet-base` + memory on, seeded
- `sonnet-no-terminal` — `sonnet-base` with the terminal toolset removed (tools dimension)

**The one real experiment** (deliverable 5): `haiku-base` vs `sonnet-base`, 12 tasks × 3 trials = 72 runs. This is the cleanest comparison to explain, and at these task sizes it costs a few dollars. The write-up will include the verdict, the paired plot, pass@k / pass^k, cost per pass, and two annotated run inspections (one where the small model failed and the large one passed, and one where both failed — to show the inspector is useful even when the answer is "the task is too hard").

---

## 6. What runs with one command

`./run.sh` (or `pnpm up`) will:

1. install dependencies
2. build shared → api → web
3. create the SQLite database and seed the sample tasks, configs, and one completed **mock** experiment, so the comparison screen has data the moment you open it
4. start the API on `http://localhost:3000`, serving the frontend

Mode is chosen per configuration (`runner: mock | hermes`). Real Hermes runs additionally need: `hermes` on your PATH, Docker running, and `ANTHROPIC_API_KEY` in your environment. `pnpm preflight` tells you which of those are missing.

---

## 7. Deliberately out of scope (and why)

- **Multi-turn / conversational tasks.** Each task is a single prompt. Multi-turn evals need a simulated user, which is a project in itself.
- **Hosted / multi-user deployment.** No auth, no job persistence across restarts beyond SQLite. A single engineer's workstation is the target.
- **Comparing more than two configs statistically.** The UI runs any number of configs, but the verdict is always *pairwise against the first (baseline)*. Multiple-comparison correction is noted in LIMITATIONS.md, not implemented.
- **Learning from Hermes's own evals folder.** Hermes ships benchmark environments for training; we use Hermes purely as the agent under test.

---

## 8. Open questions for you

1. Model names: I'll default the sample configs to the current Anthropic Haiku and Sonnet model IDs and keep them in one place (`samples/configs`) so they're trivial to change. Any preference?
2. Judge model for `llm_judge`: default to the same Haiku model, fixed across all configurations. OK?
3. Concurrency for real runs: default 2. Raise it if your rate limits allow.

If this approach looks right, the next step is `docs/DESIGN.md` (data model, API, module boundaries, stats formulas) followed by the implementation in the order: shared types → API + mock runner → stats → UI → Hermes runner → docs.
