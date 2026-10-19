<script setup lang="ts">
import type { TrialFile } from '@evals/shared';
import { computed, onMounted, ref } from 'vue';
import { api, errorMessage } from '../api';

const props = defineProps<{ trialId: string }>();

/** Files above this size are not loaded into the viewer. */
const VIEW_LIMIT = 256 * 1024;

const tab = ref<'changes' | 'files'>('changes');
const diff = ref<string | null>(null);
const diffError = ref<string | null>(null);
const files = ref<TrialFile[] | null>(null);
const filesError = ref<string | null>(null);
const selected = ref<string | null>(null);
const content = ref<string | null>(null);
const contentError = ref<string | null>(null);

onMounted(async () => {
  await Promise.all([
    api
      .trialDiff(props.trialId)
      .then((d) => (diff.value = d.diff))
      .catch((e: unknown) => (diffError.value = errorMessage(e))),
    api
      .trialFiles(props.trialId)
      .then((f) => (files.value = f))
      .catch((e: unknown) => (filesError.value = errorMessage(e))),
  ]);
});

type DiffLine = { text: string; cls: string };
const diffFiles = computed(() => {
  if (!diff.value) return [];
  return diff.value
    .split(/^(?=diff a\/)/m)
    .filter(Boolean)
    .map((block) => {
      const [head = '', ...rest] = block.replace(/\n$/, '').split('\n');
      const lines: DiffLine[] = rest
        .filter((l) => !l.startsWith('--- ') && !l.startsWith('+++ '))
        .map((text) => ({
          text,
          cls: text.startsWith('+')
            ? 'bg-emerald-50 text-emerald-900'
            : text.startsWith('-')
              ? 'bg-red-50 text-red-900'
              : text.startsWith('@@')
                ? 'text-sky-700 bg-sky-50/60'
                : text.startsWith('\\')
                  ? 'text-stone-400'
                  : 'text-stone-700',
        }));
      const added = rest.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
      const removed = rest.filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
      // The header is `diff a/<path> b/<path>` with the same path twice, so spaces are safe.
      const pathLength = (head.length - 'diff a/'.length - ' b/'.length) / 2;
      return {
        path: head.slice('diff a/'.length, 'diff a/'.length + pathLength),
        lines,
        added,
        removed,
      };
    });
});

async function open(file: TrialFile): Promise<void> {
  selected.value = file.path;
  content.value = null;
  contentError.value = null;
  if (file.size > VIEW_LIMIT) {
    contentError.value = `File is ${Math.round(file.size / 1024)} kB; too large to preview.`;
    return;
  }
  try {
    const text = await api.trialFileText(props.trialId, file.path);
    if (selected.value === file.path) content.value = text;
  } catch (e) {
    contentError.value = errorMessage(e);
  }
}

const size = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`);
</script>

<template>
  <section class="rounded-lg border border-stone-200 bg-white">
    <header class="flex items-center gap-4 border-b border-stone-100 px-4">
      <h2 class="py-3 text-sm font-medium">Workspace</h2>
      <nav class="flex gap-4 text-sm" role="tablist">
        <button
          v-for="t in ['changes', 'files'] as const"
          :key="t"
          type="button"
          role="tab"
          :aria-selected="tab === t"
          class="-mb-px border-b-2 py-3 capitalize"
          :class="
            tab === t
              ? 'border-stone-900 font-medium text-stone-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          "
          @click="tab = t"
        >
          {{ t }}
          <span v-if="t === 'changes' && diff !== null" class="text-xs text-stone-400">
            {{ diffFiles.length }}
          </span>
          <span v-if="t === 'files' && files" class="text-xs text-stone-400">
            {{ files.length }}
          </span>
        </button>
      </nav>
      <span class="ml-auto hidden text-xs text-stone-400 sm:inline">/app after the run</span>
    </header>

    <div v-if="tab === 'changes'" class="p-4">
      <p v-if="diffError" class="text-sm text-stone-500">{{ diffError }}</p>
      <div v-else-if="diff === null" class="h-16 animate-pulse rounded bg-stone-100" />
      <p v-else-if="diffFiles.length === 0" class="text-sm text-stone-500">
        The agent left the workspace unchanged.
      </p>
      <div v-else class="space-y-3">
        <div
          v-for="f in diffFiles"
          :key="f.path"
          class="overflow-hidden rounded-md border border-stone-200"
        >
          <p class="flex items-center gap-2 bg-stone-50 px-3 py-1.5 font-mono text-xs">
            {{ f.path }}
            <span class="ml-auto text-emerald-700">+{{ f.added }}</span>
            <span class="text-red-700">−{{ f.removed }}</span>
          </p>
          <pre
            class="max-h-[28rem] overflow-auto font-mono text-xs leading-5"
          ><div v-for="(l, i) in f.lines" :key="i" class="px-3 whitespace-pre-wrap" :class="l.cls">{{ l.text || ' ' }}</div></pre>
        </div>
      </div>
    </div>

    <div v-else class="grid min-h-48 sm:grid-cols-[minmax(0,14rem)_1fr]">
      <div class="border-b border-stone-100 sm:border-r sm:border-b-0">
        <p v-if="filesError" class="p-4 text-sm text-stone-500">{{ filesError }}</p>
        <p v-else-if="files?.length === 0" class="p-4 text-sm text-stone-500">No files.</p>
        <ul v-else class="max-h-[28rem] overflow-auto py-1">
          <li v-for="f in files" :key="f.path">
            <button
              type="button"
              class="flex w-full items-baseline gap-2 px-4 py-1 text-left font-mono text-xs hover:bg-stone-50"
              :class="selected === f.path ? 'bg-stone-100 font-medium' : ''"
              @click="open(f)"
            >
              <span class="min-w-0 flex-1 truncate" :title="f.path">{{ f.path }}</span>
              <span class="shrink-0 text-stone-400">{{ size(f.size) }}</span>
            </button>
          </li>
        </ul>
      </div>
      <div class="min-w-0 p-4">
        <p v-if="!selected" class="text-sm text-stone-500">Select a file to view it.</p>
        <p v-else-if="contentError" class="text-sm text-stone-500">{{ contentError }}</p>
        <div v-else-if="content === null" class="h-16 animate-pulse rounded bg-stone-100" />
        <pre
          v-else
          class="max-h-[28rem] overflow-auto font-mono text-xs leading-5 whitespace-pre-wrap"
          >{{ content }}</pre>
      </div>
    </div>
  </section>
</template>
