import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { config } from '../test-fixtures';
import NewSkillConfig from './NewSkillConfig.vue';

const responses: Record<string, unknown> = {
  '/api/v1/configs': [{ slug: 'base' }],
  '/api/v1/configs/base': config('base', { name: 'Base' }),
  '/api/v1/skills': [{ name: 'changelog-format', description: 'House format', source: 'repo' }],
  '/api/v1/skills/changelog-format': {
    name: 'changelog-format',
    description: 'House format',
    source: 'repo',
    content: '---\nname: changelog-format\n---\n# Changelog',
  },
};

function stubFetch(onPost: (body: unknown) => [number, unknown]) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const [status, body] =
      init?.method === 'POST' ? onPost(JSON.parse(init.body as string)) : [200, responses[url]];
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function mountPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: NewSkillConfig },
      { path: '/experiments/new', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  const wrapper = mount(NewSkillConfig, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

afterEach(() => vi.unstubAllGlobals());

describe('NewSkillConfig', () => {
  it('creates a config with a new skill and links to a pre-filled experiment', async () => {
    let posted: unknown;
    stubFetch((body) => {
      posted = body;
      return [
        201,
        { ...config('base-csv-tidy', { name: 'Base + csv-tidy' }), skills: ['csv-tidy'] },
      ];
    });
    const w = await mountPage();
    await w.get('input[name="skillName"]').setValue('csv-tidy');
    await w.get('input[name="description"]').setValue('House rules for CSV files.');
    await w.get('textarea[name="instructions"]').setValue('# CSV tidy\n\nUse semicolons always.');
    expect((w.get('input[name="id"]').element as HTMLInputElement).value).toBe('base-csv-tidy');

    await w.get('form').trigger('submit');
    await flushPromises();
    expect(posted).toEqual({
      id: 'base-csv-tidy',
      name: 'Base + csv-tidy',
      baseConfigId: 'base',
      skill: {
        kind: 'new',
        name: 'csv-tidy',
        description: 'House rules for CSV files.',
        instructions: '# CSV tidy\n\nUse semicolons always.',
      },
    });
    const done = w.get('[data-testid="created"]');
    expect(done.text()).toContain('base-csv-tidy created');
    expect(done.get('a').attributes('href')).toBe(
      '/experiments/new?factor=skills&baseline=base&candidate=base-csv-tidy',
    );
  });

  it('shows field errors instead of posting an incomplete form', async () => {
    const fetchMock = stubFetch(() => [500, {}]);
    const w = await mountPage();
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(w.text()).toContain('Name the skill');
    expect(w.text()).toContain('Fix the highlighted fields.');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('offers existing skills with a preview and shows a server conflict', async () => {
    stubFetch(() => [409, { error: 'Config base-changelog-format already exists' }]);
    const w = await mountPage();
    await w.findAll('[role="radio"]')[1]!.trigger('click');
    await w.get('select[name="existingSkill"]').setValue('changelog-format');
    await flushPromises();
    expect(w.text()).toContain('House format');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(w.text()).toContain('Config base-changelog-format already exists');
  });
});
