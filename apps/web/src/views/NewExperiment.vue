<script setup lang="ts">
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/vue';
import {
  factorSchema,
  taskCategorySchema,
  type AgentConfig,
  type TaskCategory,
  type TaskSummary,
} from '@evals/shared';
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiRequestError, errorMessage } from '../api';
import ErrorNote from '../components/ErrorNote.vue';
import {
  candidatesFor,
  emptyForm,
  slugify,
  toRequest,
  validate,
  type FormErrors,
} from '../experiment-form';

const props = defineProps<{ seed?: number }>();
const router = useRouter();

const form = ref(emptyForm(props.seed));
const slugTouched = ref(false);
const submitted = ref(false);
const saving = ref(false);
const loadError = ref<string | null>(null);
const submitError = ref<{ message: string; details?: unknown } | null>(null);
const tasks = ref<TaskSummary[]>([]);
const configs = ref(new Map<string, AgentConfig>());
const category = ref<TaskCategory | 'all'>('all');

onMounted(async () => {
  try {
    const [taskList, configList] = await Promise.all([api.tasks(), api.configs()]);
    tasks.value = taskList;
    const full = await Promise.all(configList.map((c) => api.config(c.slug)));
    configs.value = new Map(full.map((c) => [c.id, c]));
  } catch (e) {
    loadError.value = errorMessage(e);
  }
});

watch(
  () => form.value.name,
  (name) => {
    if (!slugTouched.value) form.value.slug = slugify(name);
  },
);

const candidates = computed(() =>
  candidatesFor(form.value.factor, form.value.baselineConfigId, configs.value),
);
watch(candidates, (list) => {
  if (!list.some((c) => c.id === form.value.candidateConfigId)) {
    form.value.candidateConfigId = list.length === 1 ? list[0]!.id : '';
  }
});

const errors = computed<FormErrors>(() => validate(form.value, configs.value));
const shown = (field: keyof FormErrors) => (submitted.value ? errors.value[field] : undefined);

const visibleTasks = computed(() =>
  category.value === 'all' ? tasks.value : tasks.value.filter((t) => t.category === category.value),
);
const categories = computed(() =>
  taskCategorySchema.options.filter((c) => tasks.value.some((t) => t.category === c)),
);
const trials = computed(() => form.value.taskIds.length * 2 * form.value.repeats);

function toggleAll(on: boolean): void {
  const ids = new Set(form.value.taskIds);
  for (const t of visibleTasks.value) {
    if (on) ids.add(t.slug);
    else ids.delete(t.slug);
  }
  form.value.taskIds = tasks.value.map((t) => t.slug).filter((s) => ids.has(s));
}

async function submit(): Promise<void> {
  submitted.value = true;
  submitError.value = null;
  if (Object.keys(errors.value).length) return;
  saving.value = true;
  try {
    const created = await api.createExperiment(toRequest(form.value));
    await router.push(`/experiments/${created.id}`);
  } catch (e) {
    submitError.value = {
      message: errorMessage(e),
      details: e instanceof ApiRequestError ? e.details : undefined,
    };
  } finally {
    saving.value = false;
  }
}

const input =
  'mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm shadow-xs focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500';
</script>

<template>
  <form class="max-w-3xl space-y-6" novalidate @submit.prevent="submit">
    <div>
      <h1 class="text-xl font-semibold">New experiment</h1>
      <p class="text-sm text-stone-600">
        Change one thing between A and B. Saved as a draft; run it from the experiment page.
      </p>
    </div>

    <ErrorNote v-if="loadError" :message="loadError" />
    <ErrorNote v-if="submitError" :message="submitError.message" :details="submitError.details" />

    <section class="grid gap-4 rounded-lg border border-stone-200 bg-white p-4 sm:grid-cols-2">
      <label class="block text-sm font-medium">
        Name
        <input v-model="form.name" :class="input" name="name" placeholder="E1 skills" />
        <span v-if="shown('name')" class="mt-1 block text-xs text-red-700">{{
          shown('name')
        }}</span>
      </label>
      <label class="block text-sm font-medium">
        Id
        <input
          v-model="form.slug"
          :class="[input, 'font-mono']"
          name="slug"
          placeholder="e1-skills"
          @input="slugTouched = true"
        />
        <span v-if="shown('slug')" class="mt-1 block text-xs text-red-700">{{
          shown('slug')
        }}</span>
      </label>
      <label class="block text-sm font-medium sm:col-span-2">
        Hypothesis
        <textarea
          v-model="form.hypothesis"
          :class="input"
          name="hypothesis"
          rows="2"
          placeholder="B scores higher on skill tasks and is unchanged elsewhere."
        />
        <span v-if="shown('hypothesis')" class="mt-1 block text-xs text-red-700">
          {{ shown('hypothesis') }}
        </span>
      </label>
    </section>

    <section class="grid gap-4 rounded-lg border border-stone-200 bg-white p-4 sm:grid-cols-3">
      <label class="block text-sm font-medium">
        Factor
        <select v-model="form.factor" :class="input" name="factor">
          <option v-for="f in factorSchema.options" :key="f" :value="f">{{ f }}</option>
        </select>
      </label>
      <label class="block text-sm font-medium">
        Baseline (A)
        <select v-model="form.baselineConfigId" :class="input" name="baseline">
          <option value="" disabled>Choose…</option>
          <option v-for="c in configs.values()" :key="c.id" :value="c.id">{{ c.id }}</option>
        </select>
        <span v-if="shown('baselineConfigId')" class="mt-1 block text-xs text-red-700">
          {{ shown('baselineConfigId') }}
        </span>
      </label>
      <label class="block text-sm font-medium">
        Candidate (B)
        <select
          v-model="form.candidateConfigId"
          :class="input"
          name="candidate"
          :disabled="!form.baselineConfigId"
        >
          <option value="" disabled>
            {{
              !form.baselineConfigId
                ? 'Pick a baseline first'
                : candidates.length
                  ? 'Choose…'
                  : `No config differs only in ${form.factor}`
            }}
          </option>
          <option v-for="c in candidates" :key="c.id" :value="c.id">{{ c.id }}</option>
        </select>
        <span v-if="shown('candidateConfigId')" class="mt-1 block text-xs text-red-700">
          {{ shown('candidateConfigId') }}
        </span>
      </label>
    </section>

    <section class="rounded-lg border border-stone-200 bg-white p-4">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="mr-2 text-sm font-medium">Tasks</h2>
        <button
          v-for="c in ['all', ...categories] as const"
          :key="c"
          type="button"
          class="rounded-full px-2.5 py-0.5 text-xs ring-1 ring-inset"
          :class="
            category === c
              ? 'bg-stone-900 text-white ring-stone-900'
              : 'ring-stone-300 hover:bg-stone-100'
          "
          @click="category = c"
        >
          {{ c }}
        </button>
        <span class="ml-auto flex gap-3 text-xs">
          <button type="button" class="hover:underline" @click="toggleAll(true)">
            Select shown
          </button>
          <button type="button" class="hover:underline" @click="toggleAll(false)">
            Clear shown
          </button>
        </span>
      </div>
      <p v-if="tasks.length === 0 && !loadError" class="mt-3 text-sm text-stone-500">
        No tasks synced. Add <code>tasks/&lt;slug&gt;/task.yaml</code> and run sync.
      </p>
      <table v-else class="mt-3 w-full text-sm">
        <thead class="text-left text-xs text-stone-500">
          <tr>
            <th class="w-8 py-1"><span class="sr-only">Include</span></th>
            <th class="py-1 font-medium">Task</th>
            <th class="py-1 font-medium">Category</th>
            <th class="py-1 text-right font-medium">Held out</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-stone-100">
          <tr v-for="t in visibleTasks" :key="t.slug">
            <td class="py-1.5">
              <input
                v-model="form.taskIds"
                type="checkbox"
                :value="t.slug"
                :aria-label="`Include ${t.slug}`"
              />
            </td>
            <td class="py-1.5">
              <span class="font-mono text-xs">{{ t.slug }}</span>
              <span class="ml-2 text-stone-600">{{ t.title }}</span>
            </td>
            <td class="py-1.5 text-stone-600">{{ t.category }}</td>
            <td class="py-1.5 text-right">
              <input
                v-model="form.heldOutTaskIds"
                type="checkbox"
                :value="t.slug"
                :disabled="!form.taskIds.includes(t.slug)"
                :aria-label="`Hold out ${t.slug}`"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <span v-if="shown('taskIds')" class="mt-2 block text-xs text-red-700">{{
        shown('taskIds')
      }}</span>
    </section>

    <section class="grid gap-4 rounded-lg border border-stone-200 bg-white p-4 sm:grid-cols-3">
      <label class="block text-sm font-medium">
        Repeats (k)
        <input
          v-model.number="form.repeats"
          :class="input"
          type="number"
          min="1"
          max="10"
          name="repeats"
        />
        <span v-if="shown('repeats')" class="mt-1 block text-xs text-red-700">{{
          shown('repeats')
        }}</span>
      </label>
      <label class="block text-sm font-medium">
        Cost cap (USD)
        <input
          v-model.number="form.costCapUsd"
          :class="input"
          type="number"
          min="0"
          step="0.5"
          name="costCapUsd"
        />
        <span v-if="shown('costCapUsd')" class="mt-1 block text-xs text-red-700">
          {{ shown('costCapUsd') }}
        </span>
      </label>
      <div class="text-sm">
        <span class="font-medium">Trials</span>
        <p class="mt-2 text-stone-700 tabular-nums">
          {{ form.taskIds.length }} tasks × 2 arms × {{ form.repeats || 0 }} =
          <strong>{{ trials }}</strong>
        </p>
      </div>

      <Disclosure v-slot="{ open }" as="div" class="sm:col-span-3">
        <DisclosureButton class="text-sm font-medium text-stone-600 hover:text-stone-900">
          {{ open ? '▾' : '▸' }} Advanced
        </DisclosureButton>
        <DisclosurePanel class="mt-3 grid gap-4 sm:grid-cols-3">
          <label class="block text-sm font-medium">
            Pass threshold
            <input
              v-model.number="form.passThreshold"
              :class="input"
              type="number"
              min="0"
              max="1"
              step="0.05"
              name="passThreshold"
            />
            <span v-if="shown('passThreshold')" class="mt-1 block text-xs text-red-700">
              {{ shown('passThreshold') }}
            </span>
          </label>
          <label class="block text-sm font-medium">
            Concurrency
            <input
              v-model.number="form.concurrency"
              :class="input"
              type="number"
              min="1"
              max="16"
              name="concurrency"
            />
            <span v-if="shown('concurrency')" class="mt-1 block text-xs text-red-700">
              {{ shown('concurrency') }}
            </span>
          </label>
          <label class="block text-sm font-medium">
            Bootstrap seed
            <input v-model.number="form.seed" :class="input" type="number" min="0" name="seed" />
            <span v-if="shown('seed')" class="mt-1 block text-xs text-red-700">{{
              shown('seed')
            }}</span>
          </label>
        </DisclosurePanel>
      </Disclosure>
    </section>

    <div class="flex items-center gap-3">
      <button
        type="submit"
        class="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        :disabled="saving"
      >
        {{ saving ? 'Saving…' : 'Create draft' }}
      </button>
      <span v-if="submitted && Object.keys(errors).length" class="text-sm text-red-700">
        Fix the highlighted fields.
      </span>
    </div>
  </form>
</template>
