export type TomlValue = string | number | boolean | string[] | Record<string, string>;
export type TomlTable = Record<string, TomlValue>;

// JSON string escapes are a subset of TOML basic-string escapes.
const str = (s: string): string => JSON.stringify(s);
const key = (k: string): string => (/^[A-Za-z0-9_-]+$/.test(k) ? k : str(k));

function value(v: TomlValue): string {
  if (typeof v === 'string') return str(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`TOML cannot represent ${v}`);
    return String(v);
  }
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(str).join(', ')}]`;
  return `{ ${Object.entries(v)
    .map(([k, s]) => `${key(k)} = ${str(s)}`)
    .join(', ')} }`;
}

/**
 * Serialises root keys and then each `[table]` in the given order. Root keys must come before the
 * first table header or TOML assigns them to that table (spike finding, implementation plan §16).
 */
export function toToml(root: TomlTable, tables: [name: string, body: TomlTable][]): string {
  const lines = (t: TomlTable): string[] =>
    Object.entries(t).map(([k, v]) => `${key(k)} = ${value(v)}`);
  const blocks = [lines(root).join('\n')];
  for (const [name, body] of tables) blocks.push([`[${name}]`, ...lines(body)].join('\n'));
  return `${blocks.filter(Boolean).join('\n\n')}\n`;
}
