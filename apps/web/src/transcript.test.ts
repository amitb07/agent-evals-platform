import { describe, expect, it } from 'vitest';
import events from '../../../packages/shared/src/__fixtures__/hermes-events.json';
import session from '../../../packages/shared/src/__fixtures__/hermes-session.json';
import { buildTimeline, inputSummary, prettyOutput, sessionToolOutputs } from './transcript';

const tool = (name: string, at: number, extra: object = {}) => ({
  type: 'tool_use',
  name,
  input: { command: `${name}-${at}` },
  timestamp: at,
  ...extra,
});
const result = (name: string, output: string, at: number, extra: object = {}) => ({
  type: 'tool_result',
  name,
  output,
  duration_ms: 10,
  is_error: false,
  timestamp: at,
  ...extra,
});

describe('buildTimeline', () => {
  it('turns the recorded Hermes events into system, tool, text and result steps', () => {
    const items = buildTimeline(events);
    expect(items.map((i) => i.kind)).toEqual(['system', 'tool', 'tool', 'text', 'result']);
    const [, first, second] = items;
    expect(first).toMatchObject({ name: 'write_file', resultIndex: 0, isError: false });
    expect(second).toMatchObject({ resultIndex: 1, durationMs: 114 });
    expect(second?.kind === 'tool' && second.output).toContain('skill-marker.txt');
  });

  it('merges streamed text fragments into one block', () => {
    const items = buildTimeline([
      { type: 'text', text: '\n\nWrote ', timestamp: 1 },
      { type: 'text', text: 'totals.json', timestamp: 2 },
    ]);
    expect(items).toEqual([{ kind: 'text', text: 'Wrote totals.json', at: 1 }]);
  });

  it('pairs results with calls by name in order, and by id when Hermes sends one', () => {
    const items = buildTimeline([
      tool('terminal', 1),
      tool('read_file', 2),
      result('read_file', 'file', 3),
      tool('terminal', 4, { tool_call_id: 'x' }),
      result('terminal', 'second', 5, { tool_call_id: 'x' }),
      result('terminal', 'first', 6),
    ]);
    const outputs = items.map((i) => (i.kind === 'tool' ? i.output : null));
    expect(outputs).toEqual(['first', 'file', 'second']);
  });

  it('flags capped output, open calls, errors and unparsed lines', () => {
    const items = buildTimeline([
      tool('terminal', 1),
      result('terminal', `${'x'.repeat(5000)}...`, 2, { is_error: true }),
      tool('terminal', 3),
      { type: 'unparsed', raw: 'not json' },
    ]);
    expect(items[0]).toMatchObject({ truncated: true, isError: true });
    expect(items[1]).toMatchObject({ output: null, resultIndex: null });
    expect(items[2]).toEqual({ kind: 'unparsed', raw: 'not json' });
  });
});

describe('helpers', () => {
  it('reads the full tool outputs from a session export in order', () => {
    const outputs = sessionToolOutputs([session]);
    expect(outputs).toHaveLength(2);
    expect(outputs[1]).toContain('skill-marker.txt');
    expect(sessionToolOutputs([])).toEqual([]);
  });

  it('unwraps terminal output and pretty-prints JSON', () => {
    expect(prettyOutput('{"output": "a\\nb", "exit_code": 0, "error": null}')).toBe(
      'a\nb\n\n— exit_code: 0',
    );
    expect(prettyOutput('{"bytes": 1}')).toBe('{\n  "bytes": 1\n}');
    expect(prettyOutput('plain')).toBe('plain');
  });

  it('summarises tool input on one line', () => {
    expect(inputSummary({ command: 'cat a\ncat b' })).toBe('cat a…');
    expect(inputSummary({ path: '/app/x' })).toBe('/app/x');
    expect(inputSummary(undefined)).toBe('');
  });
});
