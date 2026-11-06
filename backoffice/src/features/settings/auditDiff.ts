export interface DiffRow {
  path: string;
  before: unknown;
  after: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function walk(before: unknown, after: unknown, path: string, rows: DiffRow[]): void {
  if (isObject(before) || isObject(after)) {
    const a = isObject(before) ? before : {};
    const b = isObject(after) ? after : {};
    if ((!isObject(before) && before != null) || (!isObject(after) && after != null)) {
      rows.push({ path, before, after });
      return;
    }
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      walk(a[key], b[key], path ? `${path}.${key}` : key, rows);
    }
    return;
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) rows.push({ path, before, after });
}

/** Flat list of the paths whose value differs between two snapshots (create: all of `after`). */
export function jsonDiff(before: unknown, after: unknown): DiffRow[] {
  const rows: DiffRow[] = [];
  walk(before ?? null, after ?? null, '', rows);
  return rows.map((r) => ({ ...r, path: r.path || '(value)' }));
}

/** Compact JSON text of a value for the diff table. */
export function showValue(value: unknown): string {
  if (value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}
