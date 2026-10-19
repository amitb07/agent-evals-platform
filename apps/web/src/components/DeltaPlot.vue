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
  <figure class="rounded-lg border border-stone-200 bg-white p-4">
    <figcaption class="text-sm font-medium">
      Per-task delta
      <span class="font-normal text-stone-500">
        — each dot is one task's mean score in B minus A; dashed line is their mean; shaded band is
        its 95% CI
      </span>
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
