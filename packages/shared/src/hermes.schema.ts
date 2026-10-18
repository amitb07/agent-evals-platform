import { z } from 'zod';

const timestamp = z.number();

export const hermesTokensSchema = z.looseObject({
  input: z.int(),
  output: z.int(),
  total: z.int(),
  cache_read: z.int(),
  cache_write: z.int(),
});

export const hermesEventSchema = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('system'),
    timestamp,
    subtype: z.string(),
    model: z.string().optional(),
    session_id: z.string().optional(),
  }),
  z.looseObject({ type: z.literal('text'), timestamp, text: z.string() }),
  z.looseObject({ type: z.literal('tool_use'), timestamp, name: z.string(), input: z.unknown() }),
  z.looseObject({
    type: z.literal('tool_result'),
    timestamp,
    name: z.string(),
    output: z.string(),
    duration_ms: z.number(),
    is_error: z.boolean(),
  }),
  z.looseObject({
    type: z.literal('result'),
    timestamp,
    session_id: z.string(),
    exit_code: z.int(),
    text: z.string().optional(),
    tokens: hermesTokensSchema,
    duration_ms: z.number(),
  }),
]);
export type HermesEvent = z.infer<typeof hermesEventSchema>;

export const hermesToolCallSchema = z.looseObject({
  id: z.string(),
  function: z.looseObject({ name: z.string(), arguments: z.string() }),
});

export const hermesMessageSchema = z.looseObject({
  id: z.int(),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().nullable(),
  tool_calls: z.array(hermesToolCallSchema).nullable(),
  tool_call_id: z.string().nullable(),
  tool_name: z.string().nullable(),
  finish_reason: z.string().nullable(),
  timestamp,
});
export type HermesMessage = z.infer<typeof hermesMessageSchema>;

/** One object from `hermes sessions export --format jsonl`. */
export const hermesSessionSchema = z.looseObject({
  id: z.string(),
  model: z.string(),
  system_prompt: z.string().nullable(),
  started_at: z.number(),
  ended_at: z.number().nullable(),
  end_reason: z.string().nullable(),
  api_call_count: z.int(),
  input_tokens: z.int(),
  output_tokens: z.int(),
  cache_read_tokens: z.int(),
  cache_write_tokens: z.int(),
  estimated_cost_usd: z.number().nullable(),
  cost_status: z.string().nullable(),
  cost_source: z.string().nullable(),
  messages: z.array(hermesMessageSchema),
});
export type HermesSession = z.infer<typeof hermesSessionSchema>;
