<script setup lang="ts">
import type { GradeCheck } from '@evals/shared';
import { num } from '../format';

defineProps<{ grades: GradeCheck[] }>();
</script>

<template>
  <section class="rounded-lg border border-stone-200 bg-white">
    <h2 class="border-b border-stone-100 px-4 py-3 text-sm font-medium">Grades</h2>
    <p v-if="grades.length === 0" class="px-4 py-3 text-sm text-stone-500">No grades recorded.</p>
    <ul class="divide-y divide-stone-100">
      <li v-for="g in grades" :key="g.graderId" class="px-4 py-2.5 text-sm">
        <div class="flex items-center gap-2">
          <span
            class="size-1.5 shrink-0 rounded-full"
            :class="g.passed ? 'bg-emerald-600' : 'bg-red-600'"
            aria-hidden="true"
          />
          <span class="font-mono text-xs font-medium">{{ g.graderId }}</span>
          <span class="text-xs text-stone-500">{{ g.type.replace('_', ' ') }}</span>
          <span v-if="g.gate" class="rounded bg-stone-100 px-1.5 text-xs text-stone-600">gate</span>
          <span class="ml-auto tabular-nums">{{ num(g.score) }}</span>
          <span
            :class="g.passed ? 'text-emerald-700' : 'text-red-700'"
            class="w-7 text-right text-xs font-medium"
          >
            {{ g.passed ? 'pass' : 'fail' }}
          </span>
        </div>
        <p class="mt-1 pl-3.5 text-stone-700">{{ g.reason }}</p>
        <details v-if="g.evidence.length" class="mt-1 pl-3.5">
          <summary class="cursor-pointer text-xs text-stone-500 hover:text-stone-800">
            Evidence ({{ g.evidence.length }})
          </summary>
          <pre
            v-for="(e, i) in g.evidence"
            :key="i"
            class="mt-1 max-h-48 overflow-auto rounded bg-stone-50 p-2 font-mono text-xs whitespace-pre-wrap"
            >{{ e }}</pre>
        </details>
      </li>
    </ul>
  </section>
</template>
