import { hermesEventSchema, hermesMessageSchema, type HermesEvent } from '@evals/shared';

/** Hermes caps stream-json tool output at 5000 chars and appends "..." (hermes_cli/stream_json.py). */
export const STREAM_OUTPUT_CAP = 5000;

export type ToolStep = {
  kind: 'tool';
  name: string;
  input: unknown;
  /** null while no matching `tool_result` was seen (the run ended mid-call). */
  output: string | null;
  isError: boolean;
  durationMs: number | null;
  truncated: boolean;
  /** Position of the result among all tool results; matches the session's tool messages. */
  resultIndex: number | null;
  at: number;
};

export type TimelineItem =
  | { kind: 'system'; model: string | null; at: number }
  | { kind: 'text'; text: string; at: number }
  | ToolStep
  | {
      kind: 'result';
      exitCode: number;
      durationMs: number;
      tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
      at: number;
    }
  | { kind: 'unparsed'; raw: string };

const isTruncated = (output: string) => output.length > STREAM_OUTPUT_CAP && output.endsWith('...');

/**
 * Turns stream-json events into a timeline: consecutive `text` fragments are merged, and each
 * `tool_result` is attached to its `tool_use` by `tool_call_id` when present, else to the oldest
 * open call with the same name (Hermes v0.22 emits no ids, and parallel calls finish in order).
 */
export function buildTimeline(events: unknown[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  const open = new Map<string, ToolStep[]>();
  let results = 0;

  const keyOf = (e: { name: string; tool_call_id?: unknown }) =>
    typeof e.tool_call_id === 'string' ? `id:${e.tool_call_id}` : `name:${e.name}`;

  for (const raw of events) {
    const parsed = hermesEventSchema.safeParse(raw);
    if (!parsed.success) {
      const r = raw as { type?: unknown; raw?: unknown };
      items.push({
        kind: 'unparsed',
        raw: r.type === 'unparsed' && typeof r.raw === 'string' ? r.raw : JSON.stringify(raw),
      });
      continue;
    }
    const e: HermesEvent = parsed.data;
    switch (e.type) {
      case 'system':
        items.push({ kind: 'system', model: e.model ?? null, at: e.timestamp });
        break;
      case 'text': {
        const last = items.at(-1);
        if (last?.kind === 'text') last.text += e.text;
        else items.push({ kind: 'text', text: e.text, at: e.timestamp });
        break;
      }
      case 'tool_use': {
        const step: ToolStep = {
          kind: 'tool',
          name: e.name,
          input: e.input,
          output: null,
          isError: false,
          durationMs: null,
          truncated: false,
          resultIndex: null,
          at: e.timestamp,
        };
        items.push(step);
        const key = keyOf(e);
        open.set(key, [...(open.get(key) ?? []), step]);
        break;
      }
      case 'tool_result': {
        const queue = open.get(keyOf(e));
        let step = queue?.shift();
        if (!step) {
          // A result without a start event: show it on its own rather than drop it.
          step = { kind: 'tool', name: e.name, input: undefined, at: e.timestamp } as ToolStep;
          items.push(step);
        }
        Object.assign(step, {
          output: e.output,
          isError: e.is_error,
          durationMs: e.duration_ms,
          truncated: isTruncated(e.output),
          resultIndex: results++,
        });
        break;
      }
      case 'result':
        items.push({
          kind: 'result',
          exitCode: e.exit_code,
          durationMs: e.duration_ms,
          tokens: {
            input: e.tokens.input,
            output: e.tokens.output,
            cacheRead: e.tokens.cache_read,
            cacheWrite: e.tokens.cache_write,
          },
          at: e.timestamp,
        });
        break;
    }
  }
  return items.map((i) => (i.kind === 'text' ? { ...i, text: i.text.trim() } : i));
}

/** Full tool outputs from a session export, in order: index `n` is the n-th tool result. */
export function sessionToolOutputs(session: unknown[]): string[] {
  const first = session[0] as { messages?: unknown } | undefined;
  if (!first || !Array.isArray(first.messages)) return [];
  return first.messages.flatMap((m) => {
    const msg = hermesMessageSchema.safeParse(m);
    return msg.success && msg.data.role === 'tool' ? [msg.data.content ?? ''] : [];
  });
}

/** Tool outputs are often JSON strings; pretty-print them when they are. */
export function prettyOutput(output: string): string {
  const trimmed = output.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return output;
  try {
    const value = JSON.parse(trimmed) as unknown;
    // Terminal results wrap stdout in `output`; unwrap it so newlines render.
    if (value && typeof value === 'object' && 'output' in value) {
      const { output: out, ...rest } = value;
      if (typeof out === 'string') {
        const meta = Object.entries(rest)
          .filter(([, v]) => v !== null && v !== undefined)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join('  ');
        return meta ? `${out}\n\n— ${meta}` : out;
      }
    }
    return JSON.stringify(value, null, 2);
  } catch {
    return output;
  }
}

/** One-line summary of a tool call's input for the collapsed row. */
export function inputSummary(input: unknown): string {
  if (input === undefined || input === null) return '';
  if (typeof input === 'string') return input;
  if (typeof input !== 'object') return JSON.stringify(input);
  const o = input as Record<string, unknown>;
  const first = o.command ?? o.path ?? o.file_path ?? o.query ?? Object.values(o)[0];
  const text = typeof first === 'string' ? first : JSON.stringify(first ?? '');
  const line = text.split('\n')[0] ?? '';
  return line.length > 120 || text.includes('\n') ? `${line.slice(0, 120)}…` : line;
}
