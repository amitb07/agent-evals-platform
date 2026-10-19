<script setup lang="ts">
import type { TrialDetail } from '@evals/shared';
import { RouterLink } from 'vue-router';
import { api } from '../api';
import ErrorNote from '../components/ErrorNote.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { usePolling } from '../composables/usePolling';
import { duration, num, tokens, usd } from '../format';

const props = defineProps<{ id: string }>();
const { data, error, loading } = usePolling<TrialDetail>(() => api.trial(props.id));
</script>

<!-- Header and grades only; transcript, diff and A/B side by side come with the Run detail screen. -->
<template>
  <div v-if="loading" class="h-24 animate-pulse rounded-lg bg-stone-200" aria-busy="true" />
  <ErrorNote v-else-if="error" :message="error" />
  <div v-else-if="data" class="space-y-4">
    <RouterLink
      :to="`/experiments/${data.experimentId}`"
      class="text-sm text-stone-600 hover:underline"
    >
      ← Experiment
    </RouterLink>
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-xl font-semibold">
        <span class="font-mono">{{ data.taskSlug }}</span> · arm {{ data.arm }} · repeat
        {{ data.repeatIndex + 1 }}
      </h1>
      <StatusBadge :status="data.status" />
    </div>
    <dl
      class="grid grid-cols-2 gap-3 rounded-lg border border-stone-200 bg-white p-4 text-sm sm:grid-cols-4"
    >
      <div>
        <dt class="text-stone-500">Score</dt>
        <dd class="font-medium tabular-nums">{{ num(data.score) }}</dd>
      </div>
      <div>
        <dt class="text-stone-500">Config</dt>
        <dd class="font-mono">{{ data.configSlug }}</dd>
      </div>
      <div>
        <dt class="text-stone-500">Failure cause</dt>
        <dd>{{ data.failureCause ?? '—' }}</dd>
      </div>
      <div>
        <dt class="text-stone-500">Exit reason</dt>
        <dd>{{ data.turnExitReason ?? '—' }}</dd>
      </div>
      <div>
        <dt class="text-stone-500">Duration</dt>
        <dd class="tabular-nums">{{ duration(data.durationMs) }}</dd>
      </div>
      <div>
        <dt class="text-stone-500">Tokens in / out</dt>
        <dd class="tabular-nums">{{ tokens(data.tokensIn) }} / {{ tokens(data.tokensOut) }}</dd>
      </div>
      <div>
        <dt class="text-stone-500">Cost</dt>
        <dd class="tabular-nums">{{ usd(data.costUsd, 4) }}</dd>
      </div>
      <div>
        <dt class="text-stone-500">Gate</dt>
        <dd>{{ data.gatePassed === null ? '—' : data.gatePassed ? 'passed' : 'failed' }}</dd>
      </div>
    </dl>
    <ErrorNote v-if="data.error" :message="data.error" />
    <section class="rounded-lg border border-stone-200 bg-white">
      <h2 class="px-4 pt-3 text-sm font-medium">Grades</h2>
      <p v-if="data.grades.length === 0" class="px-4 py-3 text-sm text-stone-500">
        No grades recorded.
      </p>
      <ul class="divide-y divide-stone-100">
        <li v-for="g in data.grades" :key="g.graderId" class="px-4 py-2 text-sm">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs">{{ g.graderId }}</span>
            <span class="text-xs text-stone-500">{{ g.type }}</span>
            <span v-if="g.gate" class="rounded bg-stone-100 px-1.5 text-xs">gate</span>
            <span class="ml-auto tabular-nums">{{ num(g.score) }}</span>
            <span
              :class="g.passed ? 'text-emerald-700' : 'text-red-700'"
              class="text-xs font-medium"
            >
              {{ g.passed ? 'pass' : 'fail' }}
            </span>
          </div>
          <p class="mt-1 text-stone-700">{{ g.reason }}</p>
        </li>
      </ul>
    </section>
  </div>
</template>
