<script setup lang="ts">
import type { ExperimentStats } from '@evals/shared';
import { computed } from 'vue';
import { num, signed } from '../format';
import { HELP } from '../metric-help';
import InfoTip from './InfoTip.vue';

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
/** Position of a delta on the −1…+1 strip, as a CSS percentage. */
const at = (x: number) => `${((Math.max(-1, Math.min(1, x)) + 1) / 2) * 100}%`;
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
  <section :class="['rounded-xl border p-5', look.cls]" data-testid="verdict">
    <div class="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
      <div class="min-w-0 space-y-1.5">
        <p class="text-xs font-medium uppercase tracking-wider text-current/70">Verdict</p>
        <h2 class="text-2xl font-semibold tracking-tight">
          <span aria-hidden="true" class="mr-1.5">{{ look.icon }}</span
          >{{ look.title }}
        </h2>
        <p class="max-w-xl text-sm leading-relaxed">{{ sentence }}</p>
      </div>

      <div v-if="hasEffect" class="w-full shrink-0 md:w-80">
        <dl class="flex items-end justify-between gap-4">
          <div>
            <dt class="flex items-center gap-1 text-xs text-current/70">
              Effect (B − A) <InfoTip label="About effect" :text="HELP.effect" />
            </dt>
            <dd class="text-3xl font-semibold tabular-nums leading-tight">
              {{ signed(stats.effect, 3) }}
            </dd>
          </div>
          <div class="text-right">
            <dt class="flex items-center justify-end gap-1 text-xs text-current/70">
              95% CI <InfoTip label="About the 95% confidence interval" :text="HELP.ci" />
            </dt>
            <dd class="font-semibold tabular-nums">
              [{{ signed(stats.ciLow, 3) }}, {{ signed(stats.ciHigh, 3) }}]
            </dd>
          </div>
        </dl>
        <div class="relative mt-3 h-2 rounded-full bg-current/10" aria-hidden="true">
          <div class="absolute inset-y-[-3px] left-1/2 w-px bg-current/40" />
          <div
            v-if="stats.ciLow !== null && stats.ciHigh !== null"
            class="absolute inset-y-0 rounded-full bg-current/35"
            :style="{ left: at(stats.ciLow), right: `calc(100% - ${at(stats.ciHigh)})` }"
          />
          <div
            class="absolute top-1/2 size-3 -translate-1/2 rounded-full bg-current ring-2 ring-white"
            :style="{ left: at(stats.effect!) }"
          />
        </div>
        <div class="mt-1.5 flex justify-between text-[11px] text-current/60" aria-hidden="true">
          <span>−1 · B worse</span><span>0</span><span>B better · +1</span>
        </div>
      </div>
    </div>

    <div v-if="hasEffect" class="mt-5 border-t border-current/15 pt-3">
      <dl class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div>
          <dt class="inline text-current/70">MDE <InfoTip label="About MDE" :text="HELP.mde" /></dt>
          <dd class="ml-1 inline font-medium tabular-nums">{{ num(stats.mde, 3) }}</dd>
        </div>
        <div>
          <dt class="inline text-current/70">
            Tasks <InfoTip label="About tasks" :text="HELP.tasks" />
          </dt>
          <dd class="ml-1 inline font-medium tabular-nums">{{ stats.nTasks }}</dd>
        </div>
        <div>
          <dt class="inline text-current/70">k <InfoTip label="About k" :text="HELP.k" /></dt>
          <dd class="ml-1 inline font-medium tabular-nums">{{ stats.k }}</dd>
        </div>
        <div>
          <dt class="inline text-current/70">
            Excluded A / B <InfoTip label="About excluded trials" :text="HELP.excluded" />
          </dt>
          <dd class="ml-1 inline font-medium tabular-nums">
            {{ stats.arms.A.excluded }} / {{ stats.arms.B.excluded }}
          </dd>
        </div>
      </dl>
      <p v-if="stats.twoStage.ciLow !== null" class="mt-1.5 text-xs text-current/70">
        Sensitivity (two-stage bootstrap over tasks and repeats): [{{
          signed(stats.twoStage.ciLow, 3)
        }}, {{ signed(stats.twoStage.ciHigh, 3) }}]. MDE is retrospective (95% confidence, 80%
        power). {{ stats.iterations.toLocaleString() }} bootstrap draws, seed {{ stats.seed }}.
      </p>
    </div>
  </section>
</template>
