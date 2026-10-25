<script setup lang="ts">
import type { Arm, ExperimentStats } from '@evals/shared';
import { computed } from 'vue';
import VChart from 'vue-echarts';
import { ARM_COLOR, axisStyle, esc, INK, tooltipStyle } from '../charts';
import { num, usd } from '../format';

const props = defineProps<{ stats: ExperimentStats; baseline: string; candidate: string }>();

const points = (arm: Arm) =>
  props.stats.tasks.flatMap((t) => {
    const score = arm === 'A' ? t.meanA : t.meanB;
    const cost = arm === 'A' ? t.costA : t.costB;
    return score === null || cost === null ? [] : [{ value: [cost, score], task: t.taskSlug }];
  });

const hasData = computed(() => points('A').length + points('B').length > 0);

const option = computed(() => {
  const name = { A: `A · ${props.baseline}`, B: `B · ${props.candidate}` };
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 36, bottom: 36, containLabel: true },
    legend: {
      top: 0,
      right: 0,
      icon: 'circle',
      itemWidth: 10,
      textStyle: { color: INK.secondary, fontSize: 12 },
    },
    tooltip: {
      ...tooltipStyle,
      trigger: 'item',
      formatter: (p: { seriesName: string; data: { value: [number, number]; task: string } }) =>
        `<b>${esc(p.data.task)}</b><br/>${esc(p.seriesName)}<br/>score ${num(p.data.value[1])} · ${usd(p.data.value[0], 4)} per trial`,
    },
    xAxis: {
      type: 'value',
      name: 'Mean cost per trial (USD)',
      nameLocation: 'middle',
      nameGap: 24,
      scale: true,
      ...axisStyle,
    },
    yAxis: { type: 'value', name: 'Mean score', min: 0, max: 1, ...axisStyle },
    series: (['A', 'B'] as const).map((arm) => ({
      name: name[arm],
      type: 'scatter',
      symbolSize: 10,
      itemStyle: { color: ARM_COLOR[arm], borderColor: INK.surface, borderWidth: 2 },
      data: points(arm),
    })),
  };
});
</script>

<template>
  <figure class="h-full rounded-xl border border-stone-200 bg-white px-5 py-4">
    <figcaption>
      <h2 class="text-sm font-semibold">Score vs. cost</h2>
      <p class="mt-0.5 text-xs text-stone-500">
        One dot per task and arm. Up and to the left is better: higher score, lower cost.
      </p>
    </figcaption>
    <p v-if="!hasData" class="py-8 text-center text-sm text-stone-500">No graded trials yet.</p>
    <VChart
      v-else
      :option="option"
      style="height: 260px"
      autoresize
      role="img"
      aria-label="Score versus cost scatter by arm"
    />
  </figure>
</template>
