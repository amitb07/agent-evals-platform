import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TranscriptTimeline from './TranscriptTimeline.vue';

const long = `${'y'.repeat(5000)}...`;
const responses: Record<string, unknown> = {
  '/api/v1/trials/t1/events': [
    { type: 'system', subtype: 'init', model: 'claude-sonnet-5', timestamp: 1000 },
    { type: 'tool_use', name: 'terminal', input: { command: 'cat big.log' }, timestamp: 2000 },
    {
      type: 'tool_result',
      name: 'terminal',
      output: long,
      duration_ms: 50,
      is_error: true,
      timestamp: 2100,
    },
    { type: 'text', text: 'Done.', timestamp: 3000 },
  ],
  '/api/v1/trials/t1/session': [
    {
      messages: [
        {
          id: 1,
          role: 'tool',
          content: 'FULL OUTPUT',
          tool_calls: null,
          tool_call_id: 'a',
          tool_name: 'terminal',
          finish_reason: null,
          timestamp: 2,
        },
      ],
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('TranscriptTimeline', () => {
  it('renders the prompt, tool calls with error badges, and agent text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(responses[url])))),
    );
    const w = mount(TranscriptTimeline, { props: { trialId: 't1', prompt: 'Summarise big.log' } });
    await flushPromises();
    const text = w.text();
    expect(text).toContain('Summarise big.log');
    expect(text).toContain('claude-sonnet-5');
    expect(text).toContain('1 tool call · 1 with errors');
    expect(w.findAll('[data-testid="tool-step"]')).toHaveLength(1);
    expect(w.get('[data-testid="tool-step"]').text()).toContain('cat big.log');
    expect(w.get('[data-testid="tool-step"]').text()).toContain('error');
    expect(text).toContain('Done.');
  });

  it('replaces capped output with the full session output on request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(responses[url])))),
    );
    const w = mount(TranscriptTimeline, { props: { trialId: 't1', prompt: 'p' } });
    await flushPromises();
    expect(w.text()).toContain('truncated to 5,000 chars');
    await w.get('button').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('FULL OUTPUT');
    expect(w.text()).not.toContain('truncated');
  });

  it('shows the API message when there is no transcript', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'This trial has no events file' }), { status: 404 }),
        ),
      ),
    );
    const w = mount(TranscriptTimeline, { props: { trialId: 't1', prompt: 'p' } });
    await flushPromises();
    expect(w.text()).toContain('This trial has no events file');
  });
});
