import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import { errorMessage } from '../api';

export const POLL_MS = 5000;

/**
 * Loads `load()` on mount and again every 5 s while `active(data)` is true. Keeps the last good
 * data on a failed refresh and exposes the error.
 */
export function usePolling<T>(
  load: () => Promise<T>,
  active: (data: T) => boolean = () => false,
): {
  data: Ref<T | null>;
  error: Ref<string | null>;
  loading: Ref<boolean>;
  refresh: () => Promise<void>;
} {
  const data = ref<T | null>(null) as Ref<T | null>;
  const error = ref<string | null>(null);
  const loading = ref(true);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  async function refresh(): Promise<void> {
    clearTimeout(timer);
    try {
      data.value = await load();
      error.value = null;
    } catch (e) {
      error.value = errorMessage(e);
    } finally {
      loading.value = false;
    }
    if (!stopped && data.value !== null && active(data.value)) {
      timer = setTimeout(() => void refresh(), POLL_MS);
    }
  }

  onMounted(() => void refresh());
  onBeforeUnmount(() => {
    stopped = true;
    clearTimeout(timer);
  });
  return { data, error, loading, refresh };
}
