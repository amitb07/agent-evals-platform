<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ done: number; total: number }>();
const share = computed(() => (props.total > 0 ? Math.min(1, props.done / props.total) : 0));
</script>

<template>
  <div class="flex items-center gap-2">
    <div
      class="h-1.5 w-24 overflow-hidden rounded-full bg-stone-200"
      role="progressbar"
      :aria-valuenow="done"
      :aria-valuemax="total"
    >
      <div class="h-full rounded-full bg-stone-700" :style="{ width: `${share * 100}%` }" />
    </div>
    <span class="text-xs text-stone-600 tabular-nums">{{ done }}/{{ total }}</span>
  </div>
</template>
