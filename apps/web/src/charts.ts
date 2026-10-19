import { ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

use([
  ScatterChart,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
]);

/** Categorical slots 1–2 of the validated reference palette (all-pairs safe in light mode). */
export const ARM_COLOR = { A: '#2a78d6', B: '#eb6834' } as const;

export const INK = {
  primary: '#1c1917',
  secondary: '#57534e',
  muted: '#a8a29e',
  grid: '#e7e5e4',
  band: 'rgba(120, 113, 108, 0.14)',
  surface: '#ffffff',
} as const;

export const axisStyle = {
  axisLine: { lineStyle: { color: INK.grid } },
  axisTick: { show: false },
  axisLabel: { color: INK.secondary, fontSize: 11 },
  splitLine: { lineStyle: { color: INK.grid } },
  nameTextStyle: { color: INK.secondary, fontSize: 11 },
} as const;

export const tooltipStyle = {
  backgroundColor: INK.surface,
  borderColor: INK.grid,
  textStyle: { color: INK.primary, fontSize: 12 },
  extraCssText: 'box-shadow: 0 2px 8px rgba(0,0,0,0.08);',
} as const;

/** Escapes text placed in an ECharts HTML tooltip (task slugs come from YAML). */
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
