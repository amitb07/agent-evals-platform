<script setup lang="ts">
import type { ArmMetrics, ExperimentStats } from '@evals/shared';
import { ARM_COLOR } from '../charts';
import { duration, pct, tokens, usd } from '../format';

defineProps<{ stats: ExperimentStats; baseline: string; candidate: string }>();

const ROWS: { label: string; hint?: string; value: (m: ArmMetrics) => string }[] = [
  {
    label: 'pass@1',
    hint: 'share of trials that pass, averaged over tasks',
    value: (m) => pct(m.passAt1),
  },
  { label: 'pass@k', hint: 'tasks where any repeat passes', value: (m) => pct(m.passAtK) },
  { label: 'pass^k', hint: 'tasks where every repeat passes', value: (m) => pct(m.passHatK) },
  { label: 'Valid / finished', value: (m) => `${m.valid} / ${m.finished}` },
  { label: 'Excluded (infra)', value: (m) => String(m.excluded) },
  { label: 'Gate failures', value: (m) => String(m.gateFailures) },
  {
    label: 'Failure causes',
    value: (m) =>
      Object.entries(m.failures)
        .map(([cause, n]) => `${cause.replaceAll('_', ' ')} ${n}`)
        .join(', ') || '—',
  },
  { label: 'Spend', value: (m) => usd(m.costUsd) },
  { label: 'Cost per trial', value: (m) => usd(m.costPerTrialUsd, 4) },
  { label: 'Cost per pass', value: (m) => usd(m.costPerPassUsd, 4) },
  { label: 'Mean duration', value: (m) => duration(m.meanDurationMs) },
  { label: 'Mean tokens', value: (m) => tokens(m.meanTokens) },
];
</script>

<template>
  <section class="overflow-x-auto rounded-lg border border-stone-200 bg-white">
    <table class="w-full text-sm">
      <caption class="px-4 pt-3 text-left text-sm font-medium">
        By arm
        <span class="font-normal text-stone-500">— pass threshold {{ stats.passThreshold }}</span>
      </caption>
      <thead class="text-xs text-stone-500">
        <tr>
          <th class="px-4 py-2 text-left font-medium">Metric</th>
          <th class="px-4 py-2 text-right font-medium">
            <span
              class="mr-1 inline-block size-2 rounded-full"
              :style="{ background: ARM_COLOR.A }"
            />
            A · <span class="font-mono">{{ baseline }}</span>
          </th>
          <th class="px-4 py-2 text-right font-medium">
            <span
              class="mr-1 inline-block size-2 rounded-full"
              :style="{ background: ARM_COLOR.B }"
            />
            B · <span class="font-mono">{{ candidate }}</span>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-stone-100">
        <tr v-for="row in ROWS" :key="row.label">
          <th class="px-4 py-1.5 text-left font-normal text-stone-700" :title="row.hint">
            {{ row.label }}
          </th>
          <td class="px-4 py-1.5 text-right tabular-nums">{{ row.value(stats.arms.A) }}</td>
          <td class="px-4 py-1.5 text-right tabular-nums">{{ row.value(stats.arms.B) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
