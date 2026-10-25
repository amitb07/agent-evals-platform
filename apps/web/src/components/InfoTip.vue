<script setup lang="ts">
import { ref, useId } from 'vue';

defineProps<{ text: string; label: string }>();

const WIDTH = 256;
const GAP = 8;

const id = useId();
const anchor = ref<HTMLElement | null>(null);
const pos = ref<{ top: number; left: number; below: boolean } | null>(null);

/**
 * Fixed and teleported to <body>, so cards with overflow clipping cannot cut it off. Opens above
 * the icon, or below when too close to the top, and stays inside the viewport horizontally.
 */
function show(): void {
  const r = anchor.value!.getBoundingClientRect();
  const left = Math.min(
    Math.max(GAP, r.left + r.width / 2 - WIDTH / 2),
    window.innerWidth - WIDTH - GAP,
  );
  const below = r.top < 140;
  pos.value = { top: below ? r.bottom + GAP : r.top - GAP, left, below };
  window.addEventListener('scroll', hide, { once: true, capture: true });
}

function hide(): void {
  pos.value = null;
}
</script>

<template>
  <button
    ref="anchor"
    type="button"
    class="inline-flex cursor-help items-center rounded align-middle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
    :aria-label="label"
    :aria-describedby="pos ? id : undefined"
    @mouseenter="show"
    @mouseleave="hide"
    @focus="show"
    @blur="hide"
    @keydown.esc="hide"
  >
    <slot>
      <svg viewBox="0 0 16 16" class="size-3.5 opacity-50 hover:opacity-90" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.3" />
        <circle cx="8" cy="5" r="0.9" fill="currentColor" />
        <path d="M8 7.3v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      </svg>
    </slot>
  </button>
  <Teleport to="body">
    <span
      v-if="pos"
      :id="id"
      role="tooltip"
      class="pointer-events-none fixed z-50 rounded-md bg-stone-900 px-3 py-2 text-left text-xs leading-relaxed font-normal tracking-normal normal-case text-white shadow-lg"
      :class="pos.below ? '' : '-translate-y-full'"
      :style="{ top: `${pos.top}px`, left: `${pos.left}px`, width: `${WIDTH}px` }"
    >
      {{ text }}
    </span>
  </Teleport>
</template>
