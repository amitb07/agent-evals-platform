<script setup lang="ts">
import type { TrialDetail } from '@evals/shared';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../api';
import ArmComparison from '../components/ArmComparison.vue';
import ErrorNote from '../components/ErrorNote.vue';
import GradesPanel from '../components/GradesPanel.vue';
import StatusBadge from '../components/StatusBadge.vue';
import TranscriptTimeline from '../components/TranscriptTimeline.vue';
import WorkspacePanel from '../components/WorkspacePanel.vue';
import { usePolling } from '../composables/usePolling';
import { duration, tokens, usd } from '../format';
import { outcome } from '../outcome';

const props = defineProps<{ id: string }>();
const { data, error, loading } = usePolling<TrialDetail>(
  () => api.trial(props.id),
  (t) => t.status === 'pending' || t.status === 'running',
);

const result = computed(() => (data.value ? outcome(data.value) : null));
const finished = computed(
  () => data.value !== null && data.value.status !== 'pending' && data.value.status !== 'running',
);
const TONES = {
  pass: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  fail: 'border-red-200 bg-red-50 text-red-900',
  excluded: 'border-amber-200 bg-amber-50 text-amber-900',
  pending: 'border-stone-200 bg-stone-50 text-stone-700',
};
</script>

<template>
  <div v-if="loading" class="h-24 animate-pulse rounded-lg bg-stone-200" aria-busy="true" />
  <ErrorNote v-else-if="error && !data" :message="error" />
  <div v-else-if="data && result" class="space-y-4">
    <RouterLink
      :to="`/experiments/${data.experimentId}`"
      class="text-sm text-stone-600 hover:underline"
    >
      ← Experiment
    </RouterLink>

    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-xl font-semibold">
        <span class="font-mono">{{ data.taskSlug }}</span>
      </h1>
      <span class="inline-flex items-center gap-1.5 text-sm text-stone-600">
        <span
          class="size-2 rounded-full"
          :class="data.arm === 'A' ? 'bg-arm-a' : 'bg-arm-b'"
          aria-hidden="true"
        />
        arm {{ data.arm }} · <span class="font-mono">{{ data.configSlug }}</span> · repeat
        {{ data.repeatIndex + 1 }}
      </span>
      <StatusBadge :status="data.status" />
    </div>

    <div class="rounded-lg border px-4 py-3" :class="TONES[result.tone]" data-testid="outcome">
      <p class="font-medium">{{ result.title }}</p>
      <p v-if="result.detail" class="mt-0.5 text-sm">{{ result.detail }}</p>
    </div>

    <dl
      class="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm sm:grid-cols-3 lg:grid-cols-6"
    >
      <div>
        <dt class="text-xs text-stone-500">Exit reason</dt>
        <dd class="font-mono text-xs leading-5">
          {{ data.turnExitReason ?? '—'
          }}<template v-if="data.exitCode !== null"> · exit {{ data.exitCode }}</template>
        </dd>
      </div>
      <div>
        <dt class="text-xs text-stone-500">Failure cause</dt>
        <dd>{{ data.failureCause?.replaceAll('_', ' ') ?? '—' }}</dd>
      </div>
      <div>
        <dt class="text-xs text-stone-500">Duration</dt>
        <dd class="tabular-nums">{{ duration(data.durationMs) }}</dd>
      </div>
      <div>
        <dt class="text-xs text-stone-500">Tokens in / out</dt>
        <dd class="tabular-nums">{{ tokens(data.tokensIn) }} / {{ tokens(data.tokensOut) }}</dd>
      </div>
      <div>
        <dt class="text-xs text-stone-500">Cache read</dt>
        <dd class="tabular-nums">{{ tokens(data.cacheRead) }}</dd>
      </div>
      <div>
        <dt class="text-xs text-stone-500">Agent cost</dt>
        <dd class="tabular-nums">{{ usd(data.costUsd, 4) }}</dd>
      </div>
    </dl>

    <ErrorNote v-if="data.error && result.tone !== 'excluded'" :message="data.error" />

    <div class="grid items-start gap-4 lg:grid-cols-5">
      <div class="min-w-0 lg:col-span-3">
        <TranscriptTimeline v-if="finished" :trial-id="data.id" :prompt="data.prompt" />
      </div>
      <div class="min-w-0 space-y-4 lg:col-span-2">
        <GradesPanel :grades="data.grades" />
        <ArmComparison :trial="data" />
      </div>
    </div>

    <WorkspacePanel v-if="finished" :trial-id="data.id" />
  </div>
</template>
