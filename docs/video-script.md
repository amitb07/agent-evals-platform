# Video script: "Did that change make my agent better?"

Length: about 3 minutes (about 400 words of narration).

## 1. The problem (0:00 – 0:35)

**On screen:** A plain title card that reads "Did that change make my agent better?" Then a
terminal shows the same prompt run twice, giving two different answers.

> You've built an AI agent, and someone writes a new skill for it: a page of instructions on how
> to clean customer data. Does it make the agent better?
>
> Most teams find out by trying a prompt or two and reading the output. But agents are not
> predictable. Run the same task twice and you can get two different answers. One good run
> proves nothing, and neither does one bad run.
>
> So the real question is: did the change actually help, and how sure can we be?

## 2. Our proposal (0:35 – 1:30)

**On screen:** `architecture-diagram.png`. Zoom into each area as it is mentioned: Define →
Control plane → Execution → Decide & explain.

> Our answer is an A/B testing platform for Hermes Agent.
>
> You change exactly one thing: a skill, a toolset, the memory or the model. The old setup is A,
> the new one is B, and the platform runs the same tasks under both, several times each.
>
> Tasks, configs and experiments are plain YAML in Git. When you press Run, a worker hands the
> trials to Harbor. Every trial gets a brand-new container and a fresh Hermes home, and all of
> Hermes' self-learning is switched off, so nothing leaks from one run to the next.
>
> When the agent is done, only its output folder moves to a separate verifier, so the agent
> never sees the graders. Code checks run first. Then an LLM judge, a stronger model that
> doesn't know which setup it is grading.
>
> Finally, the statistics: the score difference per task, a 95% confidence interval, and one
> plain verdict: Better, Worse or Inconclusive.

## 3. The demo (1:30 – 2:40)

**On screen:** The terminal runs `docker compose up`, then the Experiments list appears.

> One command starts everything, and the demo loads four real experiments, 264 trials, with no
> API key needed.

**On screen:** E4 → Compare screen.

> In E4 we tested a customer-data cleanup skill on six cleanup tasks and two unrelated controls.
> The verdict is Better: plus 0.44, with the whole interval above zero. The pass rate goes from
> 33% to 100%, and each trial even costs less. Every cleanup task moves up, including the two we
> held back. The controls don't move.

**On screen:** A failed arm-A run of `cleanup-duplicates` → grades → transcript → diff →
*A vs B on this task*.

> But a verdict isn't enough; you need to know why. Here is a failed baseline run. Without the
> skill, Hermes did a careful cleanup, just not ours. It kept the wrong duplicate and invented
> its own report format. Each failed check gives its reason, and here are the full transcript
> and the files it changed. Side by side, the same task with the skill passes.

**On screen:** New skill config → Start an experiment → Run.

> To test your own skill, pick a base config and write the skill. The platform builds a config
> that differs in exactly that one thing. Press Run and watch the trials and the spend come in.

## 4. Close (2:40 – 3:00)

**On screen:** The E4 Compare screen again, then the architecture diagram as the final frame.

> So instead of guessing, you get proof. Change one thing, run it the same way every time, and
> get a clear verdict with the reason behind every run. With one command, any skill, tool, memory
> or model change can be measured, not just hoped for.

## Recording notes

- Pick the failed run before recording. Choose an arm-A `cleanup-duplicates` run whose failed
  checks show "wrong duplicate kept" and "report format", so the narration matches the screen.
- The "trials coming in" shot needs an API key. A tiny experiment costs about $0.10. Without a
  key, end the demo at the New skill config screen.
