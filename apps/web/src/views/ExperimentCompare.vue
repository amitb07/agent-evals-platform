<script setup lang="ts">
import type { ExperimentDetail, ExperimentStats } from '@evals/shared';
import { api } from '../api';
import ArmMetrics from '../components/ArmMetrics.vue';
import DeltaPlot from '../components/DeltaPlot.vue';
import ErrorNote from '../components/ErrorNote.vue';
import ProgressBar from '../components/ProgressBar.vue';
import ScoreCostPlot from '../components/ScoreCostPlot.vue';
import StatusBadge from '../components/StatusBadge.vue';
import TaskTable from '../components/TaskTable.vue';
import VerdictBanner from '../components/VerdictBanner.vue';
import '../charts';
import { isActive, useExperimentActions } from '../composables/useExperimentActions';
import { usePolling } from '../composables/usePolling';
import { dateTime, usd } from '../format';

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
  <div v-else-if="data" class="space-y-5">
    <header class="space-y-2">
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-xl font-semibold">{{ data.experiment.name }}</h1>
        <StatusBadge :status="data.experiment.status" />
        <span
          v-if="data.experiment.stopRequested && isActive(data.experiment.status)"
          class="text-xs text-amber-700"
        >
          stopping…
        </span>
        <div class="ml-auto flex items-center gap-2">
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
      <p class="text-sm text-stone-700">{{ data.experiment.hypothesis }}</p>
      <dl class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-600">
        <div>
          <dt class="inline">Factor</dt>
          <dd class="ml-1 inline font-medium text-stone-900">{{ data.experiment.factor }}</dd>
        </div>
        <div>
          <dt class="inline">A</dt>
          <dd class="ml-1 inline font-mono text-stone-900">{{ data.experiment.baselineConfig }}</dd>
        </div>
        <div>
          <dt class="inline">B</dt>
          <dd class="ml-1 inline font-mono text-stone-900">
            {{ data.experiment.candidateConfig }}
          </dd>
        </div>
        <div class="flex items-center gap-2">
          <dt>Progress</dt>
          <dd>
            <ProgressBar
              :done="data.experiment.progress.done"
              :total="data.experiment.progress.total"
            />
          </dd>
        </div>
        <div>
          <dt class="inline">Spend</dt>
          <dd class="ml-1 inline tabular-nums text-stone-900">
            {{ usd(data.experiment.spendUsd) }} of {{ usd(data.experiment.costCapUsd) }} cap
          </dd>
        </div>
        <div v-if="data.experiment.startedAt">
          <dt class="inline">Started</dt>
          <dd class="ml-1 inline">{{ dateTime(data.experiment.startedAt) }}</dd>
        </div>
      </dl>
    </header>

    <ErrorNote v-if="error" :message="`Refresh failed: ${error}`" />
    <ErrorNote v-if="actionError" :message="actionError.message" :details="actionError.details" />
    <ErrorNote v-if="data.experiment.error" :message="data.experiment.error" />

    <p
      v-if="data.experiment.status === 'draft'"
      class="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-600"
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
      <div class="grid items-start gap-5 lg:grid-cols-2">
        <DeltaPlot :stats="data.stats" />
        <ScoreCostPlot
          :stats="data.stats"
          :baseline="data.experiment.baselineConfig"
          :candidate="data.experiment.candidateConfig"
        />
      </div>
      <TaskTable :experiment="data.experiment" :stats="data.stats" />
      <ArmMetrics
        :stats="data.stats"
        :baseline="data.experiment.baselineConfig"
        :candidate="data.experiment.candidateConfig"
      />
    </template>
  </div>
</template>
