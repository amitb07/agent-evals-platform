<script setup lang="ts">
import type { ExperimentStatus, TrialStatus } from '@evals/shared';
import { computed } from 'vue';

const props = defineProps<{ status: ExperimentStatus | TrialStatus }>();

const STYLES: Record<string, string> = {
  draft: 'bg-stone-100 text-stone-700 ring-stone-300',
  pending: 'bg-stone-100 text-stone-700 ring-stone-300',
  queued: 'bg-sky-50 text-sky-800 ring-sky-300',
  running: 'bg-sky-50 text-sky-800 ring-sky-300',
  completed: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  graded: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  stopped_budget: 'bg-amber-50 text-amber-800 ring-amber-300',
  failed: 'bg-red-50 text-red-800 ring-red-300',
  ingest_failed: 'bg-red-50 text-red-800 ring-red-300',
};
const LABELS: Record<string, string> = {
  stopped_budget: 'stopped: budget',
  ingest_failed: 'ingest failed',
};

const cls = computed(() => STYLES[props.status] ?? STYLES.draft);
const label = computed(() => LABELS[props.status] ?? props.status);
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset"
    :class="cls"
  >
    <span
      v-if="status === 'running'"
      class="size-1.5 animate-pulse rounded-full bg-current"
      aria-hidden="true"
    />
    {{ label }}
  </span>
</template>
