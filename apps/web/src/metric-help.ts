/** Plain-language explanations shown in the ⓘ tooltips on the experiment page. */
export const HELP = {
  factor: 'The one setting that differs between A and B. Everything else is kept the same.',
  progress: 'Trials finished out of all planned trials (tasks × 2 arms × repeats).',
  spend: 'Money spent on trials so far. The run stops if it reaches the cost cap.',

  effect:
    "How much B changed the score. For each task, B's mean score minus A's; then averaged over tasks. Scores run from 0 to 1, so +0.10 is ten points higher.",
  ci: '95% confidence interval: the range the true effect very likely falls in, found by resampling the tasks thousands of times (a bootstrap). Entirely above 0 means Better, entirely below 0 means Worse, and touching 0 means Inconclusive. Better or Worse also needs at least 6 tasks.',
  mde: 'Minimum detectable effect: the smallest difference this run could reliably catch (95% confidence, 80% power). A real effect smaller than this can show up as Inconclusive.',
  tasks: 'Tasks with valid trials in both arms. The effect and its CI are computed over these.',
  k: 'Repeats: how many times each task was run in each arm. More repeats average out run-to-run randomness.',
  excluded:
    "Trials left out of every score because of an infrastructure failure, not the agent's fault. They still count toward spend.",

  passThreshold: 'A trial passes when its score is at least this value.',
  passAt1:
    'The chance that a single run passes. For each task, the share of its repeats that pass, then averaged over tasks.',
  passAtK: 'Share of tasks where at least one repeat passed: can it do the task at all?',
  passHatK: 'Share of tasks where every repeat passed: does it do the task reliably?',
  valid:
    'Finished trials that produced a usable score, out of all finished trials. Pending and running trials are not counted.',
  gateFailures:
    'Valid trials that failed a must-pass check, such as "the output file exists". A failed gate caps the score at 0.2.',
  failureCauses:
    'Why finished trials failed, with counts. Covers both agent failures (such as running out of budget) and infrastructure ones.',
  armSpend: "Total cost of this arm's finished trials, excluded ones included.",
  costPerTrial: 'Spend divided by the number of finished trials.',
  costPerPass: 'Spend divided by the number of passing trials: what one success costs.',
  meanDuration: 'Average wall-clock time of a finished trial.',
  meanTokens: 'Average tokens per finished trial, input and output together.',

  taskScore:
    "Each score is the task's mean (0 to 1) over its valid repeats. The number in brackets is how many repeats counted.",
  taskDelta: "B's mean score minus A's on this task. Green: B did better. Red: B did worse.",
  heldOut:
    'Held-out task: kept aside while the candidate config was built, so B could not be tuned to it. A gain here suggests the change generalizes.',
  flaky:
    'Repeats of the same config disagree a lot on this task (score SD above 0.25), so its mean is noisy.',
} as const;
