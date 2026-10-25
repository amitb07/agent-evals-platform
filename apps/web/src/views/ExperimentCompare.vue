<script setup lang="ts">
import type { ExperimentDetail, ExperimentStats } from '@evals/shared';
import { api } from '../api';
import ArmMetrics from '../components/ArmMetrics.vue';
import DeltaPlot from '../components/DeltaPlot.vue';
import ErrorNote from '../components/ErrorNote.vue';
import InfoTip from '../components/InfoTip.vue';
import ProgressBar from '../components/ProgressBar.vue';
import ScoreCostPlot from '../components/ScoreCostPlot.vue';
import StatusBadge from '../components/StatusBadge.vue';
import TaskTable from '../components/TaskTable.vue';
import VerdictBanner from '../components/VerdictBanner.vue';
import '../charts';
import { isActive, useExperimentActions } from '../composables/useExperimentActions';
import { usePolling } from '../composables/usePolling';
import { dateTime, usd } from '../format';
import { HELP } from '../metric-help';

const props = defineProps<{ id: string }>();

const { data, error, loading, refresh } = usePolling<{
  experiment: ExperimentDetail;
  stats: ExperimentStats;
}>(
  async () => {
    const [experiment, stats] = await Promise.all([api.experiment(props.id), api.stats(props.id)]);
    return { experiment, stats };
  },
  (d) => isActive(d.experiment.status),
);
const { busy, actionError, act } = useExperimentActions(refresh);
</script>

<template>
  <div v-if="loading" class="space-y-3" aria-busy="true">
    <div class="h-8 w-1/3 animate-pulse rounded bg-stone-200" />
    <div class="h-24 animate-pulse rounded-lg bg-stone-200" />
    <div class="h-64 animate-pulse rounded-lg bg-stone-200" />
  </div>
  <ErrorNote v-else-if="!data && error" :message="error" />
  <div v-else-if="data" class="space-y-6">
    <header class="space-y-4">
      <div class="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div class="min-w-0 flex-1 space-y-1.5">
          <div class="flex flex-wrap items-center gap-2.5">
            <h1 class="text-2xl font-semibold tracking-tight">{{ data.experiment.name }}</h1>
            <StatusBadge :status="data.experiment.status" />
            <span
              v-if="data.experiment.stopRequested && isActive(data.experiment.status)"
              class="text-xs text-amber-700"
            >
              stopping…
            </span>
          </div>
          <p class="max-w-3xl text-sm leading-relaxed text-stone-600">
            {{ data.experiment.hypothesis }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="data.experiment.status === 'draft'"
            type="button"
            class="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            :disabled="busy !== null"
            @click="act('run', data.experiment.id)"
          >
            Run
          </button>
          <button
            v-else-if="isActive(data.experiment.status)"
            type="button"
            class="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:opacity-50"
            :disabled="busy !== null || data.experiment.stopRequested"
            @click="act('stop', data.experiment.id)"
          >
            Stop
          </button>
        </div>
      </div>

      <dl
        class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 text-sm lg:grid-cols-5"
      >
        <div class="bg-white px-4 py-3">
          <dt class="flex items-center gap-1.5 text-xs font-medium text-stone-500">
            <span class="size-2 rounded-full bg-arm-a" aria-hidden="true" />A · baseline
          </dt>
          <dd
            class="mt-1 truncate font-mono text-stone-900"
            :title="data.experiment.baselineConfig"
          >
            {{ data.experiment.baselineConfig }}
          </dd>
        </div>
        <div class="bg-white px-4 py-3">
          <dt class="flex items-center gap-1.5 text-xs font-medium text-stone-500">
            <span class="size-2 rounded-full bg-arm-b" aria-hidden="true" />B · candidate
          </dt>
          <dd
            class="mt-1 truncate font-mono text-stone-900"
            :title="data.experiment.candidateConfig"
          >
            {{ data.experiment.candidateConfig }}
          </dd>
        </div>
        <div class="bg-white px-4 py-3">
          <dt class="flex items-center gap-1 text-xs font-medium text-stone-500">
            Factor <InfoTip label="About factor" :text="HELP.factor" />
          </dt>
          <dd class="mt-1 font-medium text-stone-900">{{ data.experiment.factor }}</dd>
        </div>
        <div class="bg-white px-4 py-3">
          <dt class="flex items-center gap-1 text-xs font-medium text-stone-500">
            Progress <InfoTip label="About progress" :text="HELP.progress" />
          </dt>
          <dd class="mt-1.5">
            <ProgressBar
              :done="data.experiment.progress.done"
              :total="data.experiment.progress.total"
            />
          </dd>
        </div>
        <div class="col-span-2 bg-white px-4 py-3 lg:col-span-1">
          <dt class="flex items-center gap-1 text-xs font-medium text-stone-500">
            Spend <InfoTip label="About spend" :text="HELP.spend" />
          </dt>
          <dd class="mt-1 tabular-nums text-stone-900">
            {{ usd(data.experiment.spendUsd) }}
            <span class="text-stone-500">of {{ usd(data.experiment.costCapUsd) }} cap</span>
          </dd>
        </div>
      </dl>
      <p v-if="data.experiment.startedAt" class="text-xs text-stone-500">
        Started {{ dateTime(data.experiment.startedAt) }}
      </p>
    </header>

    <ErrorNote v-if="error" :message="`Refresh failed: ${error}`" />
    <ErrorNote v-if="actionError" :message="actionError.message" :details="actionError.details" />
    <ErrorNote v-if="data.experiment.error" :message="data.experiment.error" />

    <p
      v-if="data.experiment.status === 'draft'"
      class="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-600"
    >
      Draft: {{ data.experiment.progress.total }} trials will run. Results appear here as trials
      finish.
    </p>
    <template v-else>
      <VerdictBanner
        :stats="data.stats"
        :baseline="data.experiment.baselineConfig"
        :candidate="data.experiment.candidateConfig"
      />
      <ArmMetrics
        :stats="data.stats"
        :baseline="data.experiment.baselineConfig"
        :candidate="data.experiment.candidateConfig"
      />
      <div class="grid gap-6 lg:grid-cols-2">
        <DeltaPlot :stats="data.stats" />
        <ScoreCostPlot
          :stats="data.stats"
          :baseline="data.experiment.baselineConfig"
          :candidate="data.experiment.candidateConfig"
        />
      </div>
      <TaskTable :experiment="data.experiment" :stats="data.stats" />
    </template>
  </div>
</template>
