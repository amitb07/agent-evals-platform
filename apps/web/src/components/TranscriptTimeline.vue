<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, errorMessage } from '../api';
import { duration, tokens } from '../format';
import {
  buildTimeline,
  inputSummary,
  prettyOutput,
  sessionToolOutputs,
  type TimelineItem,
} from '../transcript';

const props = defineProps<{ trialId: string; prompt: string }>();

const items = ref<TimelineItem[] | null>(null);
const error = ref<string | null>(null);
/** Full outputs from the session export, loaded on the first "load full output" click. */
const full = ref<string[] | null>(null);
const fullError = ref<string | null>(null);
const loadingFull = ref(false);

onMounted(async () => {
  try {
    items.value = buildTimeline(await api.trialEvents(props.trialId));
  } catch (e) {
    error.value = errorMessage(e);
  }
});

const start = computed(() => {
  const first = items.value?.find((i) => 'at' in i);
  return first && 'at' in first ? first.at : 0;
});
const offset = (at: number) => `+${((at - start.value) / 1000).toFixed(1)}s`;
const toolCount = computed(() => items.value?.filter((i) => i.kind === 'tool').length ?? 0);
const errorCount = computed(
  () => items.value?.filter((i) => i.kind === 'tool' && i.isError).length ?? 0,
);
const summary = computed(
  () =>
    `${toolCount.value} tool call${toolCount.value === 1 ? '' : 's'}` +
    (errorCount.value ? ` · ${errorCount.value} with errors` : ''),
);

async function loadFull(): Promise<void> {
  loadingFull.value = true;
  try {
    full.value = sessionToolOutputs(await api.trialSession(props.trialId));
  } catch (e) {
    fullError.value = errorMessage(e);
  } finally {
    loadingFull.value = false;
  }
}

const outputOf = (step: Extract<TimelineItem, { kind: 'tool' }>): string => {
  const complete = step.resultIndex !== null ? full.value?.[step.resultIndex] : undefined;
  return prettyOutput(complete ?? step.output ?? '');
};
const isFull = (step: Extract<TimelineItem, { kind: 'tool' }>) =>
  step.resultIndex !== null && full.value?.[step.resultIndex] !== undefined;
</script>

<template>
  <section class="rounded-lg border border-stone-200 bg-white">
    <header class="flex items-baseline gap-2 border-b border-stone-100 px-4 py-3">
      <h2 class="text-sm font-medium">Transcript</h2>
      <span v-if="items" class="text-xs text-stone-500">
        {{ summary }}
      </span>
    </header>

    <div class="px-4 py-3">
      <div class="mb-4">
        <p class="mb-1 text-xs font-medium tracking-wide text-stone-500 uppercase">Prompt</p>
        <p class="text-sm whitespace-pre-wrap text-stone-800">{{ prompt.trim() }}</p>
      </div>

      <p v-if="error" class="text-sm text-stone-500">{{ error }}</p>
      <div v-else-if="!items" class="h-16 animate-pulse rounded bg-stone-100" aria-busy="true" />
      <p v-else-if="items.length === 0" class="text-sm text-stone-500">No events recorded.</p>

      <ol v-else class="relative space-y-3 border-l border-stone-200 pl-4" data-testid="timeline">
        <li v-for="(item, i) in items" :key="i" class="relative">
          <span
            class="absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-2 ring-white"
            :class="
              item.kind === 'tool'
                ? item.isError
                  ? 'bg-red-500'
                  : 'bg-stone-400'
                : item.kind === 'text'
                  ? 'bg-stone-800'
                  : 'bg-stone-300'
            "
            aria-hidden="true"
          />

          <p v-if="item.kind === 'system'" class="text-xs text-stone-500">
            Session started<template v-if="item.model">
              · <span class="font-mono">{{ item.model }}</span></template
            >
          </p>

          <div v-else-if="item.kind === 'text'">
            <p class="mb-0.5 text-xs text-stone-500">
              Agent <span class="tabular-nums">{{ offset(item.at) }}</span>
            </p>
            <p class="text-sm whitespace-pre-wrap">{{ item.text }}</p>
          </div>

          <details
            v-else-if="item.kind === 'tool'"
            class="group rounded-md border border-stone-200 open:bg-stone-50/60"
            data-testid="tool-step"
          >
            <summary
              class="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-sm select-none"
            >
              <span
                class="text-stone-400 transition-transform group-open:rotate-90"
                aria-hidden="true"
                >›</span
              >
              <span class="font-mono text-xs font-medium">{{ item.name }}</span>
              <span class="min-w-0 flex-1 truncate font-mono text-xs text-stone-500">{{
                inputSummary(item.input)
              }}</span>
              <span
                v-if="item.isError"
                class="rounded bg-red-50 px-1.5 text-xs font-medium text-red-700"
                >error</span
              >
              <span v-if="item.output === null" class="text-xs text-amber-700">no result</span>
              <span class="shrink-0 text-xs text-stone-400 tabular-nums">
                {{ duration(item.durationMs) }} · {{ offset(item.at) }}
              </span>
            </summary>
            <div class="space-y-2 border-t border-stone-200 px-2.5 py-2">
              <div v-if="item.input !== undefined">
                <p class="mb-1 text-xs text-stone-500">Arguments</p>
                <pre
                  class="max-h-72 overflow-auto rounded bg-white p-2 font-mono text-xs whitespace-pre-wrap ring-1 ring-stone-200"
                  >{{ JSON.stringify(item.input, null, 2) }}</pre>
              </div>
              <div v-if="item.output !== null">
                <p class="mb-1 flex items-center gap-2 text-xs text-stone-500">
                  Output
                  <template v-if="item.truncated && !isFull(item)">
                    <span class="text-amber-700">truncated to 5,000 chars</span>
                    <button
                      type="button"
                      class="font-medium text-stone-700 underline-offset-2 hover:underline disabled:opacity-50"
                      :disabled="loadingFull"
                      @click="loadFull"
                    >
                      {{ loadingFull ? 'Loading…' : 'Load full output' }}
                    </button>
                    <span v-if="fullError" class="text-red-700">{{ fullError }}</span>
                  </template>
                </p>
                <pre
                  class="max-h-96 overflow-auto rounded bg-white p-2 font-mono text-xs whitespace-pre-wrap ring-1 ring-stone-200"
                  :class="item.isError ? 'text-red-800' : ''"
                  >{{ outputOf(item) }}</pre>
              </div>
            </div>
          </details>

          <p v-else-if="item.kind === 'result'" class="text-xs text-stone-500">
            Finished · exit {{ item.exitCode }} · {{ duration(item.durationMs) }} ·
            {{ tokens(item.tokens.input + item.tokens.cacheRead + item.tokens.cacheWrite) }} in /
            {{ tokens(item.tokens.output) }} out
          </p>

          <pre v-else class="overflow-auto font-mono text-xs whitespace-pre-wrap text-stone-500">{{
            item.raw
          }}</pre>
        </li>
      </ol>
    </div>
  </section>
</template>
