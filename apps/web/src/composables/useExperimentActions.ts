import { ref } from 'vue';
import { api, ApiRequestError, errorMessage } from '../api';

/** Run / Stop buttons: tracks the in-flight action and its error, then calls `after`. */
export function useExperimentActions(after: () => Promise<void>) {
  const busy = ref<string | null>(null);
  const actionError = ref<{ message: string; details?: unknown } | null>(null);

  async function act(kind: 'run' | 'stop', id: string): Promise<void> {
    busy.value = id;
    actionError.value = null;
    try {
      await (kind === 'run' ? api.runExperiment(id) : api.stopExperiment(id));
      await after();
    } catch (e) {
      actionError.value = {
        message: errorMessage(e),
        details: e instanceof ApiRequestError ? e.details : undefined,
      };
    } finally {
      busy.value = null;
    }
  }
  return { busy, actionError, act };
}

export const isActive = (status: string): boolean => status === 'queued' || status === 'running';
