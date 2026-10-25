<script setup lang="ts">
import type {
  Arm,
  ExperimentDetail,
  ExperimentStats,
  TaskStats,
  TrialSummary,
} from '@evals/shared';
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api, errorMessage } from '../api';
import { num, signed } from '../format';
import { HELP } from '../metric-help';
import InfoTip from './InfoTip.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ experiment: ExperimentDetail; stats: ExperimentStats }>();

const open = ref<string | null>(null);
const runs = ref<Record<string, TrialSummary[] | string>>({});

const taskId = (slug: string) => props.experiment.tasks.find((t) => t.taskSlug === slug)?.taskId;

async function toggle(slug: string): Promise<void> {
  open.value = open.value === slug ? null : slug;
  if (open.value !== slug) return;
  try {
    runs.value[slug] = await api.trials(props.experiment.id, { taskId: taskId(slug) });
  } catch (e) {
    runs.value[slug] = errorMessage(e);
  }
}

const mean = (t: TaskStats, arm: Arm) => (arm === 'A' ? t.meanA : t.meanB);
const count = (t: TaskStats, arm: Arm) => (arm === 'A' ? t.nA : t.nB);

const isZero = (d: number | null) => d === null || Math.abs(d) < 1e-9;
const deltaClass = (d: number | null) =>
  isZero(d) ? 'text-stone-500' : d! > 0 ? 'text-emerald-700' : 'text-red-700';
/** A bar growing from the centre: right and green when B is higher, left and red when lower. */
const deltaBar = (d: number) => ({
  [d > 0 ? 'left' : 'right']: '50%',
  width: `${Math.min(1, Math.abs(d)) * 50}%`,
});
</script>

<template>
  <section class="overflow-x-auto rounded-xl border border-stone-200 bg-white">
    <table class="w-full text-sm">
      <caption class="border-b border-stone-100 px-5 py-3.5 text-left">
        <span class="text-sm font-semibold">Per task</span>
        <span class="ml-2 text-xs text-stone-500">
          mean score over valid repeats (n)
          <InfoTip label="About task scores" :text="HELP.taskScore" class="ml-0.5" />
        </span>
      </caption>
      <thead class="text-xs text-stone-500">
        <tr class="border-b border-stone-100">
          <th class="px-5 py-2 text-left font-medium">Task</th>
          <th class="px-4 py-2 text-left font-medium">
            <span class="inline-flex items-center gap-1.5">
              <span class="size-2 rounded-full bg-arm-a" aria-hidden="true" />A
            </span>
          </th>
          <th class="px-4 py-2 text-left font-medium">
            <span class="inline-flex items-center gap-1.5">
              <span class="size-2 rounded-full bg-arm-b" aria-hidden="true" />B
            </span>
          </th>
          <th class="px-4 py-2 text-left font-medium">
            <span class="inline-flex items-center gap-1">
              Δ (B − A) <InfoTip label="About the task delta" :text="HELP.taskDelta" />
            </span>
          </th>
          <th class="px-5 py-2"><span class="sr-only">Runs</span></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-stone-100">
        <template v-for="t in stats.tasks" :key="t.taskSlug">
          <tr class="hover:bg-stone-50/60">
            <td class="px-5 py-2.5">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="font-mono text-xs whitespace-nowrap text-stone-900">{{
                  t.taskSlug
                }}</span>
                <InfoTip v-if="t.heldOut" label="About held-out tasks" :text="HELP.heldOut">
                  <span
                    class="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600 decoration-dotted underline-offset-2 hover:underline"
                    >held out</span
                  >
                </InfoTip>
                <InfoTip v-if="t.flaky" label="About flaky tasks" :text="HELP.flaky">
                  <span
                    class="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800 decoration-dotted underline-offset-2 hover:underline"
                    >flaky</span
                  >
                </InfoTip>
              </div>
              <div class="mt-0.5 text-xs text-stone-500">{{ t.category }}</div>
            </td>
            <td v-for="arm in ['A', 'B'] as const" :key="arm" class="px-4 py-2.5">
              <div class="flex items-center gap-2">
                <span
                  class="hidden h-1.5 w-16 overflow-hidden rounded-full bg-stone-100 sm:block"
                  aria-hidden="true"
                >
                  <span
                    class="block h-full rounded-full"
                    :class="arm === 'A' ? 'bg-arm-a' : 'bg-arm-b'"
                    :style="{ width: `${(mean(t, arm) ?? 0) * 100}%` }"
                  />
                </span>
                <span class="tabular-nums">{{ num(mean(t, arm)) }}</span>
                <span class="text-xs text-stone-400">({{ count(t, arm) }})</span>
              </div>
            </td>
            <td class="px-4 py-2.5">
              <div class="flex items-center gap-2">
                <span
                  class="relative hidden h-1.5 w-20 rounded-full bg-stone-100 sm:block"
                  aria-hidden="true"
                >
                  <span class="absolute inset-y-[-2px] left-1/2 w-px bg-stone-300" />
                  <span
                    v-if="!isZero(t.delta)"
                    class="absolute inset-y-0 rounded-full"
                    :class="t.delta! > 0 ? 'bg-emerald-500' : 'bg-red-500'"
                    :style="deltaBar(t.delta!)"
                  />
                </span>
                <span class="w-12 font-medium tabular-nums" :class="deltaClass(t.delta)">
                  {{ signed(t.delta) }}
                </span>
              </div>
            </td>
            <td class="px-5 py-2.5 text-right">
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100 hover:text-stone-900"
                :aria-expanded="open === t.taskSlug"
                @click="toggle(t.taskSlug)"
              >
                {{ open === t.taskSlug ? 'Hide runs' : 'Runs' }}
                <span
                  aria-hidden="true"
                  class="transition-transform"
                  :class="open === t.taskSlug ? 'rotate-180' : ''"
                  >▾</span
                >
              </button>
            </td>
          </tr>
          <tr v-if="open === t.taskSlug">
            <td colspan="5" class="bg-stone-50 px-5 py-3">
              <p v-if="typeof runs[t.taskSlug] === 'string'" class="text-xs text-red-700">
                {{ runs[t.taskSlug] }}
              </p>
              <p v-else-if="!runs[t.taskSlug]" class="text-xs text-stone-500">Loading…</p>
              <div v-else class="flex flex-wrap gap-2">
                <RouterLink
                  v-for="r in runs[t.taskSlug] as TrialSummary[]"
                  :key="r.id"
                  :to="`/trials/${r.id}`"
                  class="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-2 py-1 text-xs hover:border-stone-400"
                >
                  <span class="font-semibold">{{ r.arm }}{{ r.repeatIndex + 1 }}</span>
                  <StatusBadge :status="r.status" />
                  <span class="tabular-nums">{{ num(r.score) }}</span>
                  <span v-if="r.failureCause" class="text-stone-500">{{
                    r.failureCause.replaceAll('_', ' ')
                  }}</span>
                </RouterLink>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </section>
</template>
