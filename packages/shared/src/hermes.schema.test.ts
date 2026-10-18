import { describe, expect, it } from 'vitest';
import events from './__fixtures__/hermes-events.json';
import session from './__fixtures__/hermes-session.json';
import { hermesEventSchema, hermesSessionSchema } from './hermes.schema';

describe('hermesEventSchema', () => {
  it('parses every event from a real stream-json run', () => {
    const result = events.map((e) => hermesEventSchema.parse(e)).at(-1);
    expect(result?.type === 'result' && result.tokens.cache_read).toBe(11834);
  });

  it('rejects unknown event types and malformed events', () => {
    expect(hermesEventSchema.safeParse({ type: 'thinking', timestamp: 1 }).success).toBe(false);
    expect(hermesEventSchema.safeParse({ type: 'tool_result', timestamp: 1 }).success).toBe(false);
  });
});

describe('hermesSessionSchema', () => {
  it('parses a real session export and keeps unknown fields', () => {
    const parsed = hermesSessionSchema.parse({ ...session, title: 'x' });
    expect(parsed.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'tool',
      'assistant',
    ]);
    expect(parsed.messages[1]?.tool_calls?.[0]?.function.name).toBe('write_file');
    expect(parsed).toHaveProperty('title', 'x');
  });

  it('rejects a session without messages', () => {
    expect(hermesSessionSchema.safeParse({ ...session, messages: null }).success).toBe(false);
  });
});
