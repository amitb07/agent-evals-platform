<script setup lang="ts">
defineProps<{ message: string; details?: unknown }>();
</script>

<template>
  <div
    role="alert"
    class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
  >
    <p class="font-medium">{{ message }}</p>
    <ul v-if="Array.isArray(details) && details.length" class="mt-1 list-disc pl-5">
      <li v-for="(d, i) in details" :key="i">
        {{
          typeof d === 'string'
            ? d
            : `${(d as { path?: string }).path || 'body'}: ${(d as { message?: string }).message}`
        }}
      </li>
    </ul>
  </div>
</template>
