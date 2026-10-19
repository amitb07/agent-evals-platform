<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <header class="border-b border-stone-200 bg-white">
    <nav class="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
      <RouterLink to="/experiments" class="font-semibold tracking-tight">Agent Evals</RouterLink>
      <RouterLink
        to="/experiments"
        class="text-sm text-stone-600 hover:text-stone-900"
        exact-active-class="text-stone-900 font-medium"
      >
        Experiments
      </RouterLink>
      <RouterLink
        to="/experiments/new"
        class="ml-auto rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
      >
        New experiment
      </RouterLink>
    </nav>
  </header>
  <main class="mx-auto max-w-6xl px-4 py-6">
    <RouterView :key="$route.fullPath" />
  </main>
</template>
