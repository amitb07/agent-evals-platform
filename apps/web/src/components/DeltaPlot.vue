<script setup lang="ts">
import type { ExperimentStats } from '@evals/shared';
import { computed } from 'vue';
import VChart from 'vue-echarts';
import { ARM_COLOR, axisStyle, esc, INK, tooltipStyle } from '../charts';
import { num, signed } from '../format';

const props = defineProps<{ stats: ExperimentStats }>();

const rows = computed(() => props.stats.tasks.filter((t) => t.delta !== null));
const height = computed(() => `${Math.max(160, rows.value.length * 28 + 70)}px`);

const option = computed(() => {
  const s = props.stats;
  const band =
    s.ciLow !== null && s.ciHigh !== null
      ? {
          silent: true,
          itemStyle: { color: INK.band },
          data: [[{ xAxis: s.ciLow }, { xAxis: s.ciHigh }]],
        }
      : undefined;
  return {
    animation: false,
    grid: { left: 8, right: 24, top: 28, bottom: 36, containLabel: true },
    tooltip: {
      ...tooltipStyle,
      trigger: 'item',
      formatter: (p: { dataIndex: number }) => {
        const t = rows.value[p.dataIndex]!;
        return [
          `<b>${esc(t.taskSlug)}</b> <span style="color:${INK.secondary}">${t.category}${t.heldOut ? ' · held out' : ''}</span>`,
          `Δ ${signed(t.delta, 3)}`,
          `A ${num(t.meanA)} (n=${t.nA}) · B ${num(t.meanB)} (n=${t.nB})`,
          t.flaky ? 'Flaky: repeats disagree (SD > 0.25)' : '',
        ]
          .filter(Boolean)
          .join('<br/>');
      },
    },
    xAxis: {
      type: 'value',
      min: -1,
      max: 1,
      name: 'Score delta, B − A',
      nameLocation: 'middle',
      nameGap: 24,
      ...axisStyle,
    },
    yAxis: {
      type: 'category',
      data: rows.value.map((t) => t.taskSlug),
      inverse: true,
      ...axisStyle,
      splitLine: { show: false },
    },
    series: [
      {
        type: 'scatter',
        symbolSize: 10,
        itemStyle: { color: ARM_COLOR.B, borderColor: INK.surface, borderWidth: 2 },
        emphasis: { scale: 1.4 },
        data: rows.value.map((t) => [t.delta, t.taskSlug]),
        markArea: band,
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            {
              xAxis: 0,
              lineStyle: { color: INK.muted, width: 1, type: 'solid' },
              label: { show: false },
            },
            ...(s.effect !== null
              ? [
                  {
                    xAxis: s.effect,
                    lineStyle: { color: INK.primary, width: 2, type: 'dashed' },
                    label: { show: false },
                  },
                ]
              : []),
          ],
        },
      },
    ],
  };
});
</script>

<template>
  <figure class="h-full rounded-xl border border-stone-200 bg-white px-5 py-4">
    <figcaption>
      <h2 class="text-sm font-semibold">Per-task delta</h2>
      <p class="mt-0.5 text-xs text-stone-500">
        Each dot is one task's mean score in B minus A. Right of 0 means B scored higher.
      </p>
      <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600" aria-hidden="true">
        <li class="flex items-center gap-1.5">
          <span class="size-2.5 rounded-full bg-arm-b ring-2 ring-white" />task
        </li>
        <li class="flex items-center gap-1.5">
          <span class="h-3 border-l-2 border-dashed border-stone-900" />mean
        </li>
        <li class="flex items-center gap-1.5">
          <span class="h-3 w-4 rounded-sm bg-stone-500/15" />95% CI of the mean
        </li>
      </ul>
    </figcaption>
    <p v-if="rows.length === 0" class="py-8 text-center text-sm text-stone-500">
      Deltas appear once a task has valid trials in both arms.
    </p>
    <VChart
      v-else
      :option="option"
      :style="{ height }"
      autoresize
      role="img"
      aria-label="Per-task score delta dot plot"
    />
  </figure>
</template>
