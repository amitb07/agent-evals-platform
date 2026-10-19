# Methodology review of the agent-evals plan

## Is the experimental design and proposed bootstrap valid?

### Takeaway
The plan's task-level pairing is directionally correct, and averaging repeated rollouts before comparing configurations follows Anthropic's published recommendation. However, the proposed confidence interval has an unstated estimand and treats the finite rollout averages as if measured without Monte Carlo error. For this 20-task take-home, keep the task-paired headline analysis but add a simple two-stage, task-clustered bootstrap as a sensitivity analysis and state whether inference is intended to generalize beyond these exact tasks.

### Cited Findings
- Anthropic recommends repeated sampling for path-dependent outputs, averaging samples within each question, and feeding those question-level averages into inference; it separately recommends paired differences because both systems face the same questions. — [Anthropic, “A statistical approach to model evaluations”](https://www.anthropic.com/research/statistical-approach-to-model-evals)
- When items are clustered, uncertainty should be clustered on the unit of randomization; Anthropic reports clustered standard errors more than three times naive standard errors on some popular evals. — [Anthropic, “A statistical approach to model evaluations”](https://www.anthropic.com/research/statistical-approach-to-model-evals)
- A hierarchical bootstrap resamples higher-level units first and observations within each selected unit second; simulations in one technical study showed that respecting the hierarchy controlled false-positive rates under its tested clustered-data settings, although it could be conservative when observations were independent. — [Saravanan, Berman, and Sober, 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7906290/)
- Cluster bootstrapping resamples whole clusters to preserve dependence among repeated observations, reflecting the original sampling hierarchy. — [Deen and de Rooij, 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7148287/)
- Statistical inference over prompts assumes prompts are sampled from a target “question universe”; absent that target-population interpretation, the measured gap on the fixed items is simply a finite-suite quantity. — [Anthropic, “A statistical approach to model evaluations”](https://www.anthropic.com/research/statistical-approach-to-model-evals); [Kotawala, “Resolution Diagnostics for Paired LLM Evaluation”](https://arxiv.org/html/2605.30315)
- Anthropic recommends power analysis to connect item count, repeated samples, false-positive rate, and the effect size worth detecting. — [Anthropic, “A statistical approach to model evaluations”](https://www.anthropic.com/research/statistical-approach-to-model-evals)
- Anthropic's practical agent-eval guidance says 20–50 tasks can be a useful starting point when expected effects are large, but mature systems need larger suites to detect smaller effects. — [Anthropic, “Demystifying evals for AI agents”](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

### Inferences
- The proposed procedure is not simply “invalid.” It estimates the mean difference across the selected tasks after reducing rollout noise by averaging `k` attempts. Bootstrapping tasks is appropriate for uncertainty from task selection if the tasks plausibly represent a target task population.
- Its limitation is that a task-only bootstrap is conditional on the `k` realized rollouts. With only five attempts per task/config, it does not propagate uncertainty about each task's stochastic success/score distribution. Five repeats reduce within-task noise but do not turn 20 task clusters into 100 independent tasks.
- The plan should explicitly define its primary estimand: for example, “the equally weighted mean candidate-minus-baseline score over the named 20-task suite, where each task score is its expected score over fresh rollouts.” If it instead claims generalization to a broader workload, it must define that workload and justify task/category weights.
- A practical two-stage bootstrap is:
  1. Resample tasks with replacement, preferably stratified by the four predeclared categories if those category counts are deliberately fixed.
  2. Within each sampled task, resample repeat observations and recompute each configuration's mean.
  3. Compute the paired task difference and the predeclared weighted mean across sampled tasks.
  4. Repeat at least 10,000 times and report a percentile or BCa 95% interval, alongside the task-only interval as a sensitivity check.
- If repeat `r` for A and B is a genuine randomized execution block—run near the same time under shared infrastructure conditions—resample the `(A_r, B_r)` block together. If there is no defensible repeat-level match, resample A and B rollouts independently within task; merely sharing `repeatIndex` does not create statistical pairing.
- With only 20 top-level clusters, the report should avoid presenting a bootstrap verdict as exact. Show the 20 task-level deltas, the mean/median, CI, and leave “inconclusive” as a legitimate result.
- The statement that the suite detects “≈10%+” effects is unsupported until the variance of task-level paired differences is known. Predeclare a practically meaningful effect (for example, 0.10 on the score scale), estimate `SD(d_t)` from a small pilot or plausible range, and report the resulting 80%-power minimum detectable effect. If calculated from final data, label it retrospective resolution, not prospective power.
- Category breakdowns with 2–5 tasks each should be descriptive, not separately declared significant. No multiplicity framework is worth adding for this take-home.

### Gaps
- The plan does not state whether tasks are a random sample, a stratified sample, or a fixed demonstration suite.
- The task weights and the rationale for averaging heterogeneous categories are unspecified.
- The exact bootstrap interval type, random seed, handling of stratification, and minimum-detectable-effect calculation are unspecified.
- No pilot variance is available, so the actual power of 20 tasks × 5 repeats cannot be established from the plan alone.

## How should repeats, order, provider nondeterminism, retries, and infrastructure failures be handled?

### Takeaway
Use randomized A/B execution blocks, record rather than promise determinism, and predeclare a narrow retry/exclusion policy. The plan's classification of “timeout” as infrastructure is too broad: exhausting a task's agent budget is an agent outcome, while sandbox startup failure or a provider outage is infrastructure.

### Cited Findings
- Agent behavior varies across runs, so multiple trials are needed; clean, isolated environments are necessary because shared files, caches, resource exhaustion, or repository history can create correlated failures or unfairly improve performance. — [Anthropic, “Demystifying evals for AI agents”](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- In Anthropic's Terminal-Bench experiments, infrastructure configuration alone changed scores by up to six percentage points, and strict resource enforcement produced a 5.8% infrastructure-error rate versus 0.5% when uncapped. — [Anthropic, “Quantifying infrastructure noise in agentic coding evals”](https://www.anthropic.com/engineering/infrastructure-noise)
- Anthropic recommends documenting guaranteed resources and hard limits separately and treating resource configuration, concurrency, time limits, hardware, and similar conditions as first-class experimental variables. — [Anthropic, “Quantifying infrastructure noise in agentic coding evals”](https://www.anthropic.com/engineering/infrastructure-noise)
- OpenAI recommends that controlled comparisons hold tasks, scoring, budgets, and harness/tool setup fixed and report turns, tokens, attempts/retries, wall-clock time, cost, and known limitations. — [OpenAI, “A shared playbook for trustworthy third party evaluations”](https://openai.com/index/trustworthy-third-party-evaluations-foundations/)
- Anthropic's generated-evaluation system says evaluation metrics should be cited with the complete seed configuration for reproducibility. — [Anthropic, “Bloom”](https://alignment.anthropic.com/2025/bloom-auto-evals/)

### Inferences
- Build one randomized block for every `(task, repeatIndex)`. Randomly choose `A→B` or `B→A` within each block, randomize block order, and run both arms under the same queue priority and resource envelope. This limits systematic time-of-day, warm-cache, and load imbalance without claiming provider requests are identical.
- Use different random seeds across repeats. If the provider accepts a seed, record it and optionally use the same seed within an A/B block only when both arms use the same provider/model family and the provider documents comparable seeded sampling. A seed is metadata, not proof of reproducibility: provider routing, model revisions, kernels, tool timing, and agent trajectories can still vary.
- Pin an immutable model snapshot/version where the provider offers one; a moving alias is not a pinned model. Record provider, endpoint, snapshot string, sampling parameters, request IDs, timestamps, and any returned fingerprint.
- Predeclare retry semantics:
  - Retry from a fresh workspace only for failures demonstrably outside the agent: sandbox/container startup failure, host loss, connection failure before a usable response, provider 429/5xx/outage, or grader service failure.
  - Do not retry agent-caused invalid tool calls, exhausted turn/token/wall-clock budgets, test failures, refusal, or a tool process the agent launched consuming too many resources.
  - Cap automatic infrastructure retries (for example, two), retain every attempt, and mark the trial `infra_unresolved` after the cap rather than silently replacing it.
  - Report initial infra failures, retries, and unresolved exclusions by arm; differential exclusion can bias the comparison.
- Distinguish a task budget timeout from infrastructure timeout. The former is part of the measured system under a fixed budget and should normally score as an agent failure. The latter is a harness incident.
- Minimal failure taxonomy worth implementing:
  - `success`
  - `wrong_or_incomplete_outcome`
  - `agent_budget_exhausted` (turn/token/time)
  - `tool_or_policy_error` (bad tool use, refusal/safety behavior)
  - `infra_provider`
  - `infra_sandbox_or_host`
  - `grader_or_task_invalid`
  Keep the raw reason and an adjudication note so categories can be revised without rerunning.

### Gaps
- No source can guarantee deterministic replay for third-party hosted models merely from a seed; the plan should make a weaker reproducibility claim.
- The plan does not define retry count, backoff, when a partial provider response becomes an agent outcome, or whether retries retain the original randomized block.
- CPU/RAM guarantees, hard ceilings, network policy, cache behavior, and concurrency are not yet specified.

## How should graders and LLM judges be designed and validated?

### Takeaway
“Pinned, different judge model” is insufficient. For the assignment, add a small human-labeled calibration set, blind candidate identity, test order sensitivity where pairwise judging is used, and treat every candidate artifact as hostile data with a strict output schema and no judge tools.

### Cited Findings
- Anthropic recommends deterministic graders where possible, outcome grading rather than rigid trajectory grading, partial credit for multi-component tasks, and close calibration of model graders against human experts. It also recommends isolated rubric dimensions and an `Unknown` option when evidence is insufficient. — [Anthropic, “Demystifying evals for AI agents”](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- OpenAI recommends validating an LLM grader against human labels; its guidance identifies position and verbosity bias and favors clear rubrics, examples, pairwise/pass-fail judgments, and controlled response lengths. — [OpenAI, “Evaluation best practices”](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- OpenAI's grader guidance recommends testing graders on trusted human/model answers with ground-truth grades, including great, fair, poor, and edge-case outputs, and checking for reward-hacking shortcuts. — [OpenAI, “Graders”](https://developers.openai.com/api/docs/guides/graders)
- A 2025 ACL study across 15 judges, 22 tasks, and more than 150,000 judgments found position bias varied significantly by judge and task and was not attributable only to random chance; it measured repetition stability and position consistency by repeating and swapping candidate order. — [Shi et al., “Judging the Judges”](https://aclanthology.org/2025.ijcnlp-long.18/)
- Optimization-based and adversarial-suffix attacks have demonstrated that candidate text can manipulate LLM judges. — [Shi et al., “JudgeDeceiver”](https://arxiv.org/abs/2403.17710); [Maloyan, Ashinov, and Namiot, 2025](https://arxiv.org/abs/2505.13348)
- OWASP advises treating model output as untrusted at every downstream use and testing trust boundaries against prompt injection; output keyword filtering alone is insufficient. — [OWASP, “LLM Prompt Injection Prevention Cheat Sheet”](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)

### Inferences
- Preserve deterministic checks as the correctness backbone. A weighted score must not allow prose quality to compensate for a critical functional failure; mark essential tests as hard gates, then use partial credit within the remaining dimensions.
- For pointwise grading, remove config/model names, cost, token counts, and other provenance from the judge input. For pairwise grading, label outputs neutrally, randomly swap A/B, and either judge both orders or measure order consistency on the calibration set.
- A take-home-sized calibration protocol:
  1. Select roughly 20–30 outputs stratified across pass/fail, both configs, tasks using judges, borderline quality, and at least three adversarial/injection examples.
  2. Have a human label each rubric dimension before seeing the judge result; use a second label or adjudication on ambiguous cases.
  3. Freeze the judge prompt after calibration and evaluate agreement on a small held-out subset.
  4. Report agreement at the pass threshold, confusion counts (especially false passes), and disagreement examples. Do not claim broad judge validity from a tiny set.
- Put rubric and scoring instructions in the system message. Put candidate output, transcript excerpts, and file text in clearly delimited, per-call nonce-tagged untrusted sections; repeat after the data that embedded instructions must be ignored. Require schema-validated JSON with dimension scores, evidence quotes, and `unknown`; reject malformed output rather than reparsing it creatively.
- The judge should have no tools, network, secrets, or write capability. Supply only the minimum artifact needed for a rubric dimension. A delimiter is a robustness layer, not a security boundary, so include explicit injection test cases and retain human review for surprising wins.
- Pin and version the judge snapshot, prompt, rubric, few-shot examples, decoding settings, and parser. Re-judging old outputs after any judge change is a new measurement version.

### Gaps
- The plan does not specify the calibration-set size, held-out validation, human label protocol, agreement statistic, judge prompt, abstention behavior, or malformed-response policy.
- It is unclear whether subjective graders are pointwise or pairwise; position-bias controls differ.
- “Spot-check transcripts” is not a reproducible sampling rule and can selectively confirm expectations.

## Which metrics and failure analyses should be reported?

### Takeaway
Keep one predeclared primary paired effect, but do not let the aggregate weighted score hide reliability, critical failures, grader components, or resource trade-offs. `pass@k` and `pass^k` are useful secondary summaries, not substitutes for pass@1 or uncertainty.

### Cited Findings
- Anthropic defines `pass@k` as at least one success in `k` trials and `pass^k` as all `k` trials succeeding; it recommends the former when multiple attempts are operationally valid and the latter when consistent user-facing reliability matters. — [Anthropic, “Demystifying evals for AI agents”](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- The HumanEval estimator for `pass@k` is `1 - C(n-c,k)/C(n,k)` for `c` successes among `n` samples. — [Chen et al., “Evaluating Large Language Models Trained on Code”](https://arxiv.org/abs/2107.03374)
- τ-bench introduced `pass^k` to expose repeated-trial reliability and grades stateful agents using expected environment state rather than self-reported completion. — [Yao et al., “τ-bench”](https://arxiv.org/abs/2406.12045); [Sierra summary](https://sierra.ai/blog/benchmarking-ai-agents)
- OpenAI recommends reporting token efficiency/cost and, where repeated attempts are meaningful, expected cost per successful solve in addition to success rate under a fixed budget. — [OpenAI, “A shared playbook for trustworthy third party evaluations”](https://openai.com/index/trustworthy-third-party-evaluations-foundations/)
- OpenAI identifies reward hacking, refusals, contamination, broken problems, and sandbagging/evaluation awareness as validity hazards that should be checked and disclosed with headline results. — [OpenAI, “A shared playbook for trustworthy third party evaluations”](https://openai.com/index/trustworthy-third-party-evaluations-foundations/)

### Inferences
- Predeclare the primary endpoint as the paired mean difference in task-level score under a fixed task weighting and budget. Show its 95% interval and all task-level deltas.
- Required secondary metrics:
  - pass@1 / per-trial success rate with uncertainty;
  - fraction of tasks solved at least once and on every repeat;
  - within-task standard deviation or a “flaky task” flag;
  - hard-gate failure rate and each grader dimension, not only the weighted sum;
  - category deltas as descriptive diagnostics;
  - turns, tokens, wall-clock latency, cost, tool-error rate, and cost per successful trial;
  - initial infra-failure, retry, and final exclusion rates by arm.
- With exactly `n=k=5`, task-level `pass@5` collapses to “at least one of five succeeded,” while `pass^5` collapses to “all five succeeded.” Both are coarse and highly variable across only 20 tasks. Name them plainly in the UI and report denominators.
- Weighted partial credit is useful for sensitivity but can mask a non-negotiable failure. Define hard requirements first, then a smooth score for quality among otherwise valid outcomes.
- Failure analysis should sample from a predeclared set: every arm-discordant task, every infra exclusion, every judge/code disagreement, plus a fixed random sample of agreements. This is more credible than selecting only illustrative transcripts after seeing results.

### Gaps
- The score threshold defining “pass” is missing, so `pass@k` and `pass^k` are not yet reproducible.
- The plan does not define category weights, hard gates, missing-score handling, or whether cost/latency budgets are constraints or merely observational metrics.
- No policy describes how task/grader bugs discovered after unblinding affect the analysis.

## What must be pre-registered and versioned, and what are the smallest high-value fixes?

### Takeaway
The largest threat is not the bootstrap; it is designing a “skill-dependent” suite and fallback comparison to produce a clear win after seeing results. Freeze a small holdout, hypothesis, metrics, retry rules, and analysis before the final run, then version a compact run manifest. These changes fit the existing 6–7 day scope.

### Cited Findings
- Anthropic recommends unambiguous tasks, reference solutions that pass all graders, balanced cases where a behavior should and should not occur, and transcript review to detect grader bugs and unfair failures. — [Anthropic, “Demystifying evals for AI agents”](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- OpenAI says contamination can arise when tasks, answers, or close variants occur in training data or are discoverable through tools; it recommends private/new tasks where possible and tests for reproduction of task-specific details before solving. — [OpenAI, “A shared playbook for trustworthy third party evaluations”](https://openai.com/index/trustworthy-third-party-evaluations-foundations/)
- OpenAI's recommended evaluation record includes the claim, task distribution, tested model and reasoning settings, tools and harness, budgets and retries, scoring, and validity checks for reward hacking, evaluation awareness, contamination, refusals, and broken problems. — [OpenAI, “A shared playbook for trustworthy third party evaluations”](https://openai.com/index/trustworthy-third-party-evaluations-foundations/)
- Anthropic found that shared state such as repository history can expose prior solutions, while OpenAI lists hidden answer files and ground-truth patches in repository history as broken-problem shortcuts. — [Anthropic, “Demystifying evals for AI agents”](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents); [OpenAI, “A shared playbook for trustworthy third party evaluations”](https://openai.com/index/trustworthy-third-party-evaluations-foundations/)
- No single contamination-detection method is reliable across all contamination types and model-access settings, according to a 2026 systematic review of 55 studies. — [Sainz et al., “Are LLM Benchmarks Already Contaminated?”](https://aclanthology.org/2026.gem-main.50/)

### Inferences
- The current “real experiment” is vulnerable to confirmation bias: five explicitly skill-dependent tasks plus a comparison “likely to show a clear effect,” followed by a fallback to different model tiers, allows the tested claim to change after results. Treat the first runs as development, then freeze a final comparison and run it once on held-out variants not used to write the skill.
- A lightweight split is enough: use approximately 12–15 tasks while developing the skill/graders and reserve 5–8 newly authored variants for the final demonstration. If that is too small for inference, report the holdout as external-validity evidence and run the paired CI on the frozen full suite while clearly labeling development exposure.
- Because tasks are offline, keep oracle tests, expected outputs, and grader secrets outside the agent-mounted workspace; strip `.git` history; disable network access; and hash the starting filesystem. A public canary is optional and cannot prove absence of contamination.
- Pre-register in a short `experiment.yaml` before final execution:
  - claim, one changed factor, primary hypothesis, direction if one-sided, and practically meaningful effect;
  - task IDs, categories, inclusion/exclusion rules, weights, pass threshold, and hard gates;
  - repeats, block randomization, seeds, schedule, concurrency, budgets, retry rules, and infra taxonomy;
  - primary/secondary metrics, estimand, bootstrap algorithm/iterations/seed, CI level, verdict rule, and MDE method;
  - judge calibration protocol and transcript-review sampling rule;
  - contamination/shortcut checks and the rule for task bugs found after unblinding.
- Version in a machine-readable run manifest:
  - Git commit and dirty status; task YAML, fixture, reference solution, grader/test, rubric, system prompt, skill, memory, and tool-schema hashes;
  - Hermes source commit and container image digest; API/worker/UI commits; dependency lockfile;
  - exact agent and judge provider/model snapshot identifiers, endpoint, sampling/reasoning parameters, context/token limits, and returned fingerprints;
  - Docker/runtime/OS architecture, CPU/RAM guarantee and hard limit, timeout enforcement, network/cache policy, concurrency, timestamps, randomized order, and seed;
  - raw attempt lineage including retries, provider request IDs, token/cost accounting, transcripts, workspace diffs/final state, grader outputs, and exclusions.
- Never place credentials in the manifest. Publish an environment-variable-name template and hash or redact sensitive artifacts.
- Prioritized smallest fixes:
  1. **P0 — Freeze the final claim and holdout.** Remove the result-contingent fallback and reserve unseen task variants.
  2. **P0 — Define outcomes and failures.** Add hard gates, pass threshold, retry cap, and the agent-vs-infra taxonomy; classify budget timeout as agent outcome.
  3. **P0 — Randomize and record.** Execute A/B in randomized blocks and persist a complete run manifest.
  4. **P1 — Make uncertainty repeat-aware.** Keep the paired task bootstrap, add within-task resampling as a sensitivity interval, and state the estimand/MDE assumptions.
  5. **P1 — Calibrate and harden the judge.** Use a small human-labeled set, blind provenance, test swapped order, fence untrusted output, require strict JSON, and disable judge tools.
  6. **P1 — Expand reporting, not UI.** Add pass@1, plain-language any/all-of-five reliability, hard-failure and infra rates, task-level deltas, and cost per success.
  7. **P2 — Add a structured failure reason and fixed transcript audit sample.** Avoid building advanced mixed-effects models, multi-judge ensembles, contamination scanners, or statistics menus for this assignment.

### Gaps
- The exact model/provider capabilities available to the assignment—immutable snapshots, seed support, fingerprints, and request IDs—are unknown and must be discovered during the Day-1 spike.
- The origin and secrecy of the 20 tasks are unknown, so contamination risk cannot be quantified.
- The plan does not say when task, grader, skill, or judge-prompt development stops relative to the final experiment.
