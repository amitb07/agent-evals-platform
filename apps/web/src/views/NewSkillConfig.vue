<script setup lang="ts">
import type { AgentConfig, SkillDetail, SkillSummary } from '@evals/shared';
import { MAX_SKILL_CHARS } from '@evals/shared';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { api, ApiRequestError, errorMessage } from '../api';
import ErrorNote from '../components/ErrorNote.vue';
import { slugify } from '../experiment-form';
import {
  emptySkillConfigForm,
  SKILL_TEMPLATE,
  suggestedIdentity,
  toSkillConfigRequest,
  validateSkillConfig,
  type SkillConfigErrors,
} from '../skill-config-form';

const form = ref(emptySkillConfigForm());
const configs = ref(new Map<string, AgentConfig>());
const skills = ref<SkillSummary[]>([]);
const preview = ref<SkillDetail | null>(null);
const loadError = ref<string | null>(null);
const submitError = ref<{ message: string; details?: unknown } | null>(null);
const submitted = ref(false);
const saving = ref(false);
const created = ref<AgentConfig | null>(null);
const identityTouched = ref(false);

onMounted(async () => {
  try {
    const [list, skillList] = await Promise.all([api.configs(), api.skills()]);
    const full = await Promise.all(list.map((c) => api.config(c.slug)));
    configs.value = new Map(full.map((c) => [c.id, c]));
    skills.value = skillList;
    if (!configs.value.has(form.value.baseConfigId)) {
      form.value.baseConfigId = full[0]?.id ?? '';
    }
  } catch (e) {
    loadError.value = errorMessage(e);
  }
});

const base = computed(() => configs.value.get(form.value.baseConfigId));
const available = computed(() => skills.value.filter((s) => !base.value?.skills.includes(s.name)));

watch(
  () => [form.value.baseConfigId, form.value.mode, form.value.skillName, form.value.existingSkill],
  () => {
    if (identityTouched.value) return;
    const { id, name } = suggestedIdentity(form.value, base.value);
    form.value.id = id;
    form.value.name = name;
  },
);

watch(
  () => form.value.existingSkill,
  async (name) => {
    preview.value = null;
    if (!name) return;
    try {
      preview.value = await api.skill(name);
    } catch {
      preview.value = null;
    }
  },
);

const errors = computed<SkillConfigErrors>(() =>
  validateSkillConfig(form.value, base.value, new Set(configs.value.keys())),
);
const shown = (field: keyof SkillConfigErrors) =>
  submitted.value ? errors.value[field] : undefined;

const describeConfig = (c: AgentConfig) =>
  [
    c.model,
    c.toolsets.join(', '),
    c.skills.length ? `skills: ${c.skills.join(', ')}` : 'no skills',
    `memory ${c.memory.mode}`,
    `${c.maxTurns} turns`,
  ].join(' · ');

async function submit(): Promise<void> {
  submitted.value = true;
  submitError.value = null;
  if (Object.keys(errors.value).length) return;
  saving.value = true;
  try {
    created.value = await api.createSkillConfig(toSkillConfigRequest(form.value));
  } catch (e) {
    submitError.value = {
      message: errorMessage(e),
      details: e instanceof ApiRequestError ? e.details : undefined,
    };
  } finally {
    saving.value = false;
  }
}

function reset(): void {
  form.value = emptySkillConfigForm();
  if (created.value) configs.value.set(created.value.id, created.value);
  created.value = null;
  submitted.value = false;
  identityTouched.value = false;
  void api.skills().then((s) => (skills.value = s));
}

const experimentLink = computed(() =>
  created.value
    ? {
        path: '/experiments/new',
        query: {
          factor: 'skills',
          baseline: form.value.baseConfigId,
          candidate: created.value.id,
        },
      }
    : '/experiments/new',
);

const input =
  'mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm shadow-xs focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500';
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <div>
      <h1 class="text-xl font-semibold">New skill config</h1>
      <p class="text-sm text-stone-600">
        A copy of a base config with one more skill. Compare the two in an experiment to see whether
        the skill helps.
      </p>
    </div>

    <ErrorNote v-if="loadError" :message="loadError" />

    <section
      v-if="created"
      class="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4"
      data-testid="created"
    >
      <div>
        <p class="font-medium text-emerald-900">
          Config <span class="font-mono">{{ created.id }}</span> created
        </p>
        <p class="mt-1 text-sm text-emerald-900/80">{{ describeConfig(created) }}</p>
        <p class="mt-1 text-sm text-emerald-900/80">
          It differs from <span class="font-mono">{{ form.baseConfigId }}</span> only in its skills,
          so you can compare the two in a <em>skills</em> experiment.
        </p>
      </div>
      <div class="flex gap-3">
        <RouterLink
          :to="experimentLink"
          class="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          Start an experiment
        </RouterLink>
        <button
          type="button"
          class="rounded-md px-4 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white"
          @click="reset"
        >
          Create another
        </button>
      </div>
    </section>

    <form v-else class="space-y-6" novalidate @submit.prevent="submit">
      <ErrorNote v-if="submitError" :message="submitError.message" :details="submitError.details" />

      <section class="rounded-lg border border-stone-200 bg-white p-4">
        <label class="block text-sm font-medium">
          Base config
          <select v-model="form.baseConfigId" :class="input" name="base">
            <option value="" disabled>Choose…</option>
            <option v-for="c in configs.values()" :key="c.id" :value="c.id">{{ c.id }}</option>
          </select>
        </label>
        <p v-if="base" class="mt-2 text-xs text-stone-500">{{ describeConfig(base) }}</p>
        <span v-if="shown('baseConfigId')" class="mt-1 block text-xs text-red-700">
          {{ shown('baseConfigId') }}
        </span>
      </section>

      <section class="space-y-4 rounded-lg border border-stone-200 bg-white p-4">
        <div class="flex items-center gap-3">
          <h2 class="text-sm font-medium">Skill</h2>
          <div
            class="inline-flex rounded-md bg-stone-100 p-0.5 text-sm"
            role="radiogroup"
            aria-label="Skill source"
          >
            <button
              v-for="m in [
                { value: 'new', label: 'Write a new skill' },
                { value: 'existing', label: 'Use an existing skill' },
              ] as const"
              :key="m.value"
              type="button"
              role="radio"
              :aria-checked="form.mode === m.value"
              class="rounded px-3 py-1"
              :class="
                form.mode === m.value
                  ? 'bg-white font-medium shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              "
              @click="form.mode = m.value"
            >
              {{ m.label }}
            </button>
          </div>
        </div>

        <template v-if="form.mode === 'new'">
          <div class="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <label class="block text-sm font-medium">
              Name
              <input
                v-model="form.skillName"
                :class="[input, 'font-mono']"
                name="skillName"
                placeholder="csv-tidy"
                @blur="form.skillName = slugify(form.skillName)"
              />
              <span v-if="shown('skillName')" class="mt-1 block text-xs text-red-700">
                {{ shown('skillName') }}
              </span>
            </label>
            <label class="block text-sm font-medium">
              When to use it
              <input
                v-model="form.description"
                :class="input"
                name="description"
                placeholder="House rules for cleaning customer CSV exports."
              />
              <span v-if="shown('description')" class="mt-1 block text-xs text-red-700">
                {{ shown('description') }}
              </span>
            </label>
          </div>
          <label class="block text-sm font-medium">
            <span class="flex items-baseline gap-3">
              Instructions
              <span class="text-xs font-normal text-stone-500">
                Markdown. Hermes reads the whole file; be specific.
              </span>
              <button
                v-if="!form.instructions"
                type="button"
                class="ml-auto text-xs font-medium text-stone-600 hover:text-stone-900"
                @click="form.instructions = SKILL_TEMPLATE"
              >
                Use template
              </button>
            </span>
            <textarea
              v-model="form.instructions"
              :class="[input, 'font-mono text-xs leading-5']"
              name="instructions"
              rows="16"
              spellcheck="false"
              placeholder="# My skill&#10;&#10;Use this skill when …&#10;&#10;## Rules&#10;1. …"
            />
            <span class="mt-1 flex text-xs">
              <span v-if="shown('instructions')" class="text-red-700">
                {{ shown('instructions') }}
              </span>
              <span class="ml-auto text-stone-400 tabular-nums">
                {{ form.instructions.length.toLocaleString() }} /
                {{ MAX_SKILL_CHARS.toLocaleString() }}
              </span>
            </span>
          </label>
        </template>

        <template v-else>
          <label class="block text-sm font-medium">
            Skill
            <select v-model="form.existingSkill" :class="input" name="existingSkill">
              <option value="" disabled>
                {{ available.length ? 'Choose…' : 'No skill left to add to this base' }}
              </option>
              <option v-for="s in available" :key="s.name" :value="s.name">
                {{ s.name }}{{ s.source === 'custom' ? ' (created in the UI)' : '' }}
              </option>
            </select>
            <span v-if="shown('existingSkill')" class="mt-1 block text-xs text-red-700">
              {{ shown('existingSkill') }}
            </span>
          </label>
          <details v-if="preview" class="rounded-md border border-stone-200">
            <summary class="cursor-pointer px-3 py-2 text-sm text-stone-700">
              {{ preview.description || 'Show SKILL.md' }}
            </summary>
            <pre
              class="max-h-80 overflow-auto border-t border-stone-200 p-3 font-mono text-xs whitespace-pre-wrap"
              >{{ preview.content }}</pre>
          </details>
        </template>
      </section>

      <section class="grid gap-4 rounded-lg border border-stone-200 bg-white p-4 sm:grid-cols-2">
        <label class="block text-sm font-medium">
          Config id
          <input
            v-model="form.id"
            :class="[input, 'font-mono']"
            name="id"
            placeholder="base-csv-tidy"
            @input="identityTouched = true"
          />
          <span v-if="shown('id')" class="mt-1 block text-xs text-red-700">{{ shown('id') }}</span>
        </label>
        <label class="block text-sm font-medium">
          Display name
          <input
            v-model="form.name"
            :class="input"
            name="name"
            placeholder="Base + csv-tidy"
            @input="identityTouched = true"
          />
          <span v-if="shown('name')" class="mt-1 block text-xs text-red-700">{{
            shown('name')
          }}</span>
        </label>
      </section>

      <div class="flex items-center gap-3">
        <button
          type="submit"
          class="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          :disabled="saving"
        >
          {{ saving ? 'Creating…' : 'Create config' }}
        </button>
        <span v-if="submitted && Object.keys(errors).length" class="text-sm text-red-700">
          Fix the highlighted fields.
        </span>
      </div>
    </form>
  </div>
</template>
