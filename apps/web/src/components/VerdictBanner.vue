<script setup lang="ts">
import type { ExperimentStats } from '@evals/shared';
import { computed } from 'vue';
import { num, signed } from '../format';

const props = defineProps<{ stats: ExperimentStats; baseline: string; candidate: string }>();

const LOOK = {
  better: { icon: '▲', title: 'Better', cls: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
  worse: { icon: '▼', title: 'Worse', cls: 'border-red-300 bg-red-50 text-red-900' },
  inconclusive: {
    icon: '●',
    title: 'Inconclusive',
    cls: 'border-stone-300 bg-stone-100 text-stone-900',
  },
} as const;

const look = computed(() => LOOK[props.stats.verdict]);
const hasEffect = computed(() => props.stats.effect !== null);
const sentence = computed(() => {
  const s = props.stats;
  if (s.effect === null) return 'No task has valid trials in both arms yet.';
  if (s.verdict === 'better')
    return `${props.candidate} scores higher than ${props.baseline}: the whole 95% CI is above zero.`;
  if (s.verdict === 'worse')
    return `${props.candidate} scores lower than ${props.baseline}: the whole 95% CI is below zero.`;
  return s.verdictNote ?? 'The 95% CI includes zero: this run cannot tell the configs apart.';
});
</script>

<template>
  <section :class="['rounded-lg border p-4', look.cls]" data-testid="verdict">
    <div class="flex flex-wrap items-baseline gap-x-6 gap-y-2">
      <h2 class="text-2xl font-semibold">
        <span aria-hidden="true" class="mr-1">{{ look.icon }}</span
        >{{ look.title }}
      </h2>
      <dl v-if="hasEffect" class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div>
          <dt class="inline text-current/70">Effect (B − A)</dt>
          <dd class="ml-1 inline font-semibold tabular-nums">{{ signed(stats.effect, 3) }}</dd>
        </div>
        <div>
          <dt class="inline text-current/70">95% CI</dt>
          <dd class="ml-1 inline font-semibold tabular-nums">
            [{{ signed(stats.ciLow, 3) }}, {{ signed(stats.ciHigh, 3) }}]
          </dd>
        </div>
        <div>
          <dt class="inline text-current/70">MDE</dt>
          <dd class="ml-1 inline tabular-nums">{{ num(stats.mde, 3) }}</dd>
        </div>
        <div>
          <dt class="inline text-current/70">Tasks</dt>
          <dd class="ml-1 inline tabular-nums">{{ stats.nTasks }}</dd>
        </div>
        <div>
          <dt class="inline text-current/70">k</dt>
          <dd class="ml-1 inline tabular-nums">{{ stats.k }}</dd>
        </div>
        <div>
          <dt class="inline text-current/70">Excluded A / B</dt>
          <dd class="ml-1 inline tabular-nums">
            {{ stats.arms.A.excluded }} / {{ stats.arms.B.excluded }}
          </dd>
        </div>
      </dl>
    </div>
    <p class="mt-2 text-sm">{{ sentence }}</p>
    <p v-if="hasEffect && stats.twoStage.ciLow !== null" class="mt-1 text-xs text-current/70">
      Sensitivity (two-stage bootstrap over tasks and repeats): [{{
        signed(stats.twoStage.ciLow, 3)
      }}, {{ signed(stats.twoStage.ciHigh, 3) }}]. MDE is retrospective (95% confidence, 80% power).
      {{ stats.iterations.toLocaleString() }} bootstrap draws, seed {{ stats.seed }}.
    </p>
  </section>
</template>
