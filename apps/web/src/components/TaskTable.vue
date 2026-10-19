<script setup lang="ts">
import type { ExperimentDetail, ExperimentStats, TrialSummary } from '@evals/shared';
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api, errorMessage } from '../api';
import { num, signed } from '../format';
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

const deltaClass = (d: number | null) =>
  d === null || Math.abs(d) < 1e-9 ? 'text-stone-600' : d > 0 ? 'text-emerald-700' : 'text-red-700';
</script>

<template>
  <section class="overflow-x-auto rounded-lg border border-stone-200 bg-white">
    <table class="w-full text-sm">
      <caption class="px-4 pt-3 text-left text-sm font-medium">
        Per task
        <span class="font-normal text-stone-500">— mean score over valid repeats (n)</span>
      </caption>
      <thead class="text-xs text-stone-500">
        <tr>
          <th class="px-4 py-2 text-left font-medium">Task</th>
          <th class="px-4 py-2 text-left font-medium">Category</th>
          <th class="px-4 py-2 text-right font-medium">A</th>
          <th class="px-4 py-2 text-right font-medium">B</th>
          <th class="px-4 py-2 text-right font-medium">Δ</th>
          <th class="px-4 py-2"><span class="sr-only">Runs</span></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-stone-100">
        <template v-for="t in stats.tasks" :key="t.taskSlug">
          <tr>
            <td class="px-4 py-2">
              <span class="font-mono text-xs">{{ t.taskSlug }}</span>
              <span
                v-if="t.heldOut"
                class="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600"
                >held out</span
              >
              <span
                v-if="t.flaky"
                class="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800"
                title="Repeats of one config disagree (SD above 0.25)"
                >flaky</span
              >
            </td>
            <td class="px-4 py-2 text-stone-600">{{ t.category }}</td>
            <td class="px-4 py-2 text-right tabular-nums">
              {{ num(t.meanA) }} <span class="text-xs text-stone-400">({{ t.nA }})</span>
            </td>
            <td class="px-4 py-2 text-right tabular-nums">
              {{ num(t.meanB) }} <span class="text-xs text-stone-400">({{ t.nB }})</span>
            </td>
            <td class="px-4 py-2 text-right font-medium tabular-nums" :class="deltaClass(t.delta)">
              {{ signed(t.delta) }}
            </td>
            <td class="px-4 py-2 text-right">
              <button
                type="button"
                class="text-xs font-medium text-stone-600 hover:text-stone-900"
                :aria-expanded="open === t.taskSlug"
                @click="toggle(t.taskSlug)"
              >
                {{ open === t.taskSlug ? 'Hide runs' : 'Runs' }}
              </button>
            </td>
          </tr>
          <tr v-if="open === t.taskSlug">
            <td colspan="6" class="bg-stone-50 px-4 py-2">
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
