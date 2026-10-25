<script setup lang="ts">
import type { ArmMetrics, ExperimentStats } from '@evals/shared';
import { ARM_COLOR } from '../charts';
import { duration, pct, tokens, usd } from '../format';
import { HELP } from '../metric-help';
import InfoTip from './InfoTip.vue';

defineProps<{ stats: ExperimentStats; baseline: string; candidate: string }>();

type Row = { label: string; hint?: string; help: string; value: (m: ArmMetrics) => string };

const RATES: (Row & { share: (m: ArmMetrics) => number | null })[] = [
  {
    label: 'pass@1',
    hint: 'share of trials that pass, averaged over tasks',
    help: HELP.passAt1,
    value: (m) => pct(m.passAt1),
    share: (m) => m.passAt1,
  },
  {
    label: 'pass@k',
    hint: 'tasks where any repeat passes',
    help: HELP.passAtK,
    value: (m) => pct(m.passAtK),
    share: (m) => m.passAtK,
  },
  {
    label: 'pass^k',
    hint: 'tasks where every repeat passes',
    help: HELP.passHatK,
    value: (m) => pct(m.passHatK),
    share: (m) => m.passHatK,
  },
];

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'Reliability',
    rows: [
      { label: 'Valid / finished', help: HELP.valid, value: (m) => `${m.valid} / ${m.finished}` },
      { label: 'Excluded (infra)', help: HELP.excluded, value: (m) => String(m.excluded) },
      { label: 'Gate failures', help: HELP.gateFailures, value: (m) => String(m.gateFailures) },
      {
        label: 'Failure causes',
        help: HELP.failureCauses,
        value: (m) =>
          Object.entries(m.failures)
            .map(([cause, n]) => `${cause.replaceAll('_', ' ')} ${n}`)
            .join(', ') || '—',
      },
    ],
  },
  {
    title: 'Cost & speed',
    rows: [
      { label: 'Spend', help: HELP.armSpend, value: (m) => usd(m.costUsd) },
      { label: 'Cost per trial', help: HELP.costPerTrial, value: (m) => usd(m.costPerTrialUsd, 4) },
      { label: 'Cost per pass', help: HELP.costPerPass, value: (m) => usd(m.costPerPassUsd, 4) },
      { label: 'Mean duration', help: HELP.meanDuration, value: (m) => duration(m.meanDurationMs) },
      { label: 'Mean tokens', help: HELP.meanTokens, value: (m) => tokens(m.meanTokens) },
    ],
  },
];
</script>

<template>
  <section class="rounded-xl border border-stone-200 bg-white">
    <header
      class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-stone-100 px-5 py-3.5"
    >
      <h2 class="text-sm font-semibold">By arm</h2>
      <span
        class="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600"
      >
        pass threshold {{ stats.passThreshold }}
        <InfoTip label="About the pass threshold" :text="HELP.passThreshold" />
      </span>
      <ul class="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
        <li class="flex items-center gap-1.5">
          <span class="size-2 rounded-full" :style="{ background: ARM_COLOR.A }" />
          A · <span class="font-mono">{{ baseline }}</span>
        </li>
        <li class="flex items-center gap-1.5">
          <span class="size-2 rounded-full" :style="{ background: ARM_COLOR.B }" />
          B · <span class="font-mono">{{ candidate }}</span>
        </li>
      </ul>
    </header>

    <div class="grid divide-y divide-stone-100 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
      <div class="px-5 py-4">
        <h3 class="text-xs font-medium uppercase tracking-wider text-stone-500">Pass rate</h3>
        <dl class="mt-3 space-y-4">
          <div v-for="row in RATES" :key="row.label">
            <dt class="text-sm">
              <span class="font-medium text-stone-900">{{ row.label }}</span>
              <InfoTip :label="`About ${row.label}`" :text="row.help" class="ml-1 text-stone-500" />
              <span class="ml-1.5 text-xs text-stone-500">{{ row.hint }}</span>
            </dt>
            <dd class="mt-1.5 space-y-1">
              <div
                v-for="arm in ['A', 'B'] as const"
                :key="arm"
                class="flex items-center gap-2 text-xs"
              >
                <span class="w-3 font-medium text-stone-500">{{ arm }}</span>
                <span class="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <span
                    class="block h-full rounded-full"
                    :style="{
                      width: `${(row.share(stats.arms[arm]) ?? 0) * 100}%`,
                      background: ARM_COLOR[arm],
                    }"
                  />
                </span>
                <span class="w-10 text-right font-medium tabular-nums text-stone-900">
                  {{ row.value(stats.arms[arm]) }}
                </span>
              </div>
            </dd>
          </div>
        </dl>
      </div>

      <div v-for="group in GROUPS" :key="group.title" class="px-5 py-4">
        <table class="w-full text-sm">
          <caption class="text-left text-xs font-medium uppercase tracking-wider text-stone-500">
            {{
              group.title
            }}
          </caption>
          <thead class="text-xs text-stone-500">
            <tr>
              <th class="py-2 text-left font-normal"><span class="sr-only">Metric</span></th>
              <th class="w-20 py-2 text-right font-medium">
                <span
                  class="mr-1 inline-block size-2 rounded-full"
                  :style="{ background: ARM_COLOR.A }"
                />A
              </th>
              <th class="w-20 py-2 text-right font-medium">
                <span
                  class="mr-1 inline-block size-2 rounded-full"
                  :style="{ background: ARM_COLOR.B }"
                />B
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            <tr v-for="row in group.rows" :key="row.label">
              <th class="py-1.5 pr-2 text-left font-normal text-stone-600">
                {{ row.label }}
                <InfoTip :label="`About ${row.label}`" :text="row.help" class="ml-0.5" />
              </th>
              <td class="py-1.5 pl-2 text-right tabular-nums">{{ row.value(stats.arms.A) }}</td>
              <td class="py-1.5 pl-2 text-right tabular-nums">{{ row.value(stats.arms.B) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
