<script setup lang="ts">
import type { ExperimentSummary } from '@evals/shared';
import { RouterLink } from 'vue-router';
import { api } from '../api';
import ErrorNote from '../components/ErrorNote.vue';
import ProgressBar from '../components/ProgressBar.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { isActive, useExperimentActions } from '../composables/useExperimentActions';
import { usePolling } from '../composables/usePolling';
import { dateTime, usd } from '../format';

const { data, error, loading, refresh } = usePolling<ExperimentSummary[]>(api.experiments, (list) =>
  list.some((e) => isActive(e.status)),
);
const { busy, actionError, act } = useExperimentActions(refresh);
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-baseline justify-between">
      <h1 class="text-xl font-semibold">Experiments</h1>
      <p class="text-sm text-stone-500">Baseline A vs. candidate B, one factor changed.</p>
    </div>

    <ErrorNote v-if="error" :message="error" />
    <ErrorNote v-if="actionError" :message="actionError.message" :details="actionError.details" />

    <div v-if="loading" class="space-y-2" aria-busy="true">
      <div v-for="i in 3" :key="i" class="h-12 animate-pulse rounded-md bg-stone-200" />
    </div>

    <div
      v-else-if="data && data.length === 0"
      class="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center"
    >
      <p class="font-medium">No experiments yet</p>
      <p class="mt-1 text-sm text-stone-600">
        Add one to <code>experiments/*.yaml</code> and sync, or create one here.
      </p>
      <RouterLink
        to="/experiments/new"
        class="mt-4 inline-block rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white"
      >
        New experiment
      </RouterLink>
    </div>

    <div v-else-if="data" class="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-stone-200 text-xs text-stone-500 uppercase">
          <tr>
            <th class="px-4 py-2 font-medium">Name</th>
            <th class="px-4 py-2 font-medium">Factor</th>
            <th class="px-4 py-2 font-medium">A vs B</th>
            <th class="px-4 py-2 font-medium">Status</th>
            <th class="px-4 py-2 font-medium">Progress</th>
            <th class="px-4 py-2 text-right font-medium">Spend</th>
            <th class="px-4 py-2"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-stone-100">
          <tr v-for="e in data" :key="e.id" class="hover:bg-stone-50">
            <td class="px-4 py-3">
              <RouterLink :to="`/experiments/${e.id}`" class="font-medium hover:underline">
                {{ e.name }}
              </RouterLink>
              <div class="text-xs text-stone-500">{{ e.slug }} · {{ dateTime(e.createdAt) }}</div>
            </td>
            <td class="px-4 py-3">{{ e.factor }}</td>
            <td class="px-4 py-3 text-xs">
              <span class="font-mono">{{ e.baselineConfig }}</span>
              <span class="mx-1 text-stone-400">vs</span>
              <span class="font-mono">{{ e.candidateConfig }}</span>
            </td>
            <td class="px-4 py-3"><StatusBadge :status="e.status" /></td>
            <td class="px-4 py-3">
              <ProgressBar :done="e.progress.done" :total="e.progress.total" />
            </td>
            <td class="px-4 py-3 text-right tabular-nums">{{ usd(e.spendUsd) }}</td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <button
                v-if="e.status === 'draft'"
                type="button"
                class="rounded-md border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100 disabled:opacity-50"
                :disabled="busy === e.id"
                @click="act('run', e.id)"
              >
                Run
              </button>
              <button
                v-else-if="isActive(e.status)"
                type="button"
                class="rounded-md border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100 disabled:opacity-50"
                :disabled="busy === e.id"
                @click="act('stop', e.id)"
              >
                Stop
              </button>
              <RouterLink
                :to="`/experiments/${e.id}`"
                class="ml-2 text-xs font-medium text-stone-600 hover:text-stone-900"
              >
                Open
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
