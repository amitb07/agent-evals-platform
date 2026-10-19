<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="py-16 text-center">
    <p class="text-lg font-medium">Page not found</p>
    <RouterLink to="/experiments" class="mt-2 inline-block text-sm text-stone-600 hover:underline">
      Back to experiments
    </RouterLink>
  </div>
</template>
