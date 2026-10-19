import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { config } from '../test-fixtures';
import NewExperiment from './NewExperiment.vue';

const responses: Record<string, unknown> = {
  '/api/v1/tasks': [
    { slug: 'csv-summary', title: 'CSV summary', category: 'tools', graderCount: 2 },
    { slug: 'changelog-01', title: 'Changelog', category: 'skill', graderCount: 2 },
  ],
  '/api/v1/configs': [{ slug: 'base' }, { slug: 'base-skill' }],
  '/api/v1/configs/base': config('base'),
  '/api/v1/configs/base-skill': config('base-skill', { skills: ['changelog-format'] }),
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

async function mountForm() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: NewExperiment },
      { path: '/experiments/:id', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  const wrapper = mount(NewExperiment, { props: { seed: 7 }, global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

afterEach(() => vi.unstubAllGlobals());

describe('NewExperiment', () => {
  it('shows field errors on submit and does not post an invalid form', async () => {
    const fetchMock = stubFetch(() => [500, {}]);
    const { wrapper } = await mountForm();
    await wrapper.get('form').trigger('submit');
    const text = wrapper.text();
    expect(text).toContain('Pick at least one task');
    expect(text).toContain('Pick a baseline config');
    expect(text).toContain('Fix the highlighted fields.');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('auto-picks the only valid candidate, posts the YAML shape and opens the experiment', async () => {
    let posted: unknown;
    stubFetch((body) => {
      posted = body;
      return [201, { id: '6f1c2a5e-8a1b-4c3d-9e2f-0a1b2c3d4e5f' }];
    });
    const { wrapper, router } = await mountForm();
    await wrapper.get('input[name="name"]').setValue('E1 skills');
    await wrapper.get('textarea[name="hypothesis"]').setValue('The skill helps.');
    await wrapper.get('select[name="baseline"]').setValue('base');
    await wrapper.get('input[aria-label="Include changelog-01"]').setValue(true);
    expect((wrapper.get('select[name="candidate"]').element as HTMLSelectElement).value).toBe(
      'base-skill',
    );
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(posted).toMatchObject({
      id: 'e1-skills',
      factor: 'skills',
      taskIds: ['changelog-01'],
      baselineConfigId: 'base',
      candidateConfigId: 'base-skill',
      repeats: 3,
      seed: 7,
    });
    expect(router.currentRoute.value.path).toBe(
      '/experiments/6f1c2a5e-8a1b-4c3d-9e2f-0a1b2c3d4e5f',
    );
  });

  it('shows server-side validation details', async () => {
    stubFetch(() => [409, { error: 'Experiment e1-skills already exists' }]);
    const { wrapper } = await mountForm();
    await wrapper.get('input[name="name"]').setValue('E1 skills');
    await wrapper.get('textarea[name="hypothesis"]').setValue('h');
    await wrapper.get('select[name="baseline"]').setValue('base');
    await wrapper.get('input[aria-label="Include csv-summary"]').setValue(true);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('already exists');
  });
});
