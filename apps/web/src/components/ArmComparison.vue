<script setup lang="ts">
import type { TrialDetail } from '@evals/shared';
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api, errorMessage } from '../api';
import { duration, num, tokens, usd } from '../format';

const props = defineProps<{ trial: TrialDetail }>();

const other = ref<TrialDetail | null>(null);
const error = ref<string | null>(null);
const done = ref(false);
const otherArm = computed(() => (props.trial.arm === 'A' ? 'B' : 'A'));

/** The same task and repeat in the other arm; another repeat when that one is missing. */
onMounted(async () => {
  try {
    const rows = await api.trials(props.trial.experimentId, {
      taskId: props.trial.taskId,
      arm: otherArm.value,
    });
    const match =
      rows.find((r) => r.repeatIndex === props.trial.repeatIndex) ??
      rows.find((r) => r.status === 'graded') ??
      rows[0];
    if (match) other.value = await api.trial(match.id);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    done.value = true;
  }
});

const pair = computed(() => {
  const o = other.value;
  if (!o) return null;
  return props.trial.arm === 'A' ? { A: props.trial, B: o } : { A: o, B: props.trial };
});

type Row = { label: string; A: string; B: string; differs: boolean; mono?: boolean };
const rows = computed<Row[]>(() => {
  const p = pair.value;
  if (!p) return [];
  const row = (label: string, f: (t: TrialDetail) => string, mono = false): Row => ({
    label,
    A: f(p.A),
    B: f(p.B),
    differs: f(p.A) !== f(p.B),
    mono,
  });
  const yesNo = (v: boolean | null) => (v === null ? '—' : v ? 'yes' : 'no');
  const graderIds = [...new Set([...p.A.grades, ...p.B.grades].map((g) => g.graderId))];
  const gradeOf = (t: TrialDetail, id: string) => {
    const g = t.grades.find((x) => x.graderId === id);
    return g ? `${num(g.score)} ${g.passed ? '✓' : '✗'}` : '—';
  };
  return [
    row('Config', (t) => t.configSlug, true),
    row('Repeat', (t) => String(t.repeatIndex + 1)),
    row('Score', (t) => num(t.score)),
    row('Passed', (t) => yesNo(t.passed)),
    row('Gate', (t) => yesNo(t.gatePassed)),
    ...graderIds.map((id) => row(id, (t) => gradeOf(t, id), true)),
    row('Failure', (t) => t.failureCause?.replaceAll('_', ' ') ?? '—'),
    row('Duration', (t) => duration(t.durationMs)),
    row('Tokens out', (t) => tokens(t.tokensOut)),
    row('Cost', (t) => usd(t.costUsd, 4)),
  ];
});
</script>

<template>
  <section class="rounded-lg border border-stone-200 bg-white">
    <header class="flex items-baseline gap-2 border-b border-stone-100 px-4 py-3">
      <h2 class="text-sm font-medium">A vs B on this task</h2>
      <RouterLink
        v-if="other"
        :to="`/trials/${other.id}`"
        class="ml-auto text-xs font-medium text-stone-600 hover:text-stone-900"
      >
        Open arm {{ other.arm }} run →
      </RouterLink>
    </header>
    <p v-if="error" class="px-4 py-3 text-sm text-stone-500">{{ error }}</p>
    <div v-else-if="!done" class="m-4 h-24 animate-pulse rounded bg-stone-100" />
    <p v-else-if="!pair" class="px-4 py-3 text-sm text-stone-500">
      No arm {{ otherArm }} run for this task yet.
    </p>
    <table v-else class="w-full text-sm">
      <thead class="text-xs text-stone-500">
        <tr>
          <th class="px-4 py-2 text-left font-medium"><span class="sr-only">Field</span></th>
          <th
            v-for="arm in ['A', 'B'] as const"
            :key="arm"
            class="px-4 py-2 text-right font-medium"
          >
            <span class="inline-flex items-center gap-1.5">
              <span
                class="size-2 rounded-full"
                :class="arm === 'A' ? 'bg-arm-a' : 'bg-arm-b'"
                aria-hidden="true"
              />
              {{ arm }}<span v-if="trial.arm === arm" class="text-stone-400">(this)</span>
            </span>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-stone-100">
        <tr v-for="r in rows" :key="r.label" :class="r.differs ? '' : 'text-stone-500'">
          <td class="px-4 py-1.5 text-stone-500" :class="r.mono ? 'font-mono text-xs' : ''">
            {{ r.label }}
          </td>
          <td
            class="px-4 py-1.5 text-right tabular-nums"
            :class="[r.mono ? 'font-mono text-xs' : '', r.differs ? 'font-medium' : '']"
          >
            {{ r.A }}
          </td>
          <td
            class="px-4 py-1.5 text-right tabular-nums"
            :class="[r.mono ? 'font-mono text-xs' : '', r.differs ? 'font-medium' : '']"
          >
            {{ r.B }}
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
