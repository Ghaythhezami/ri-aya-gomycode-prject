/**
 * Overlap layout for one day column (APP-4). Pure and computed once per day, so
 * the week grid can render 500 appointments without per-block measurement.
 *
 * Items that overlap in time are grouped into a cluster; inside a cluster each item
 * takes the first free column (greedy interval colouring) and every item of the
 * cluster shares the cluster's column count, so widths are even and nothing hides.
 */
export interface LayoutInput {
  id: string;
  /** Minutes after local midnight. */
  start: number;
  end: number;
}

export interface LayoutSlot {
  id: string;
  /** Zero-based column inside the cluster. */
  col: number;
  /** Number of columns in the cluster. */
  cols: number;
}

/** A block shorter than this still reserves this much room so it stays clickable. */
export const MIN_SPAN_MINUTES = 20;

export function layoutOverlaps(items: readonly LayoutInput[]): Map<string, LayoutSlot> {
  const result = new Map<string, LayoutSlot>();
  const sorted = items
    .map((item) => ({ ...item, end: Math.max(item.end, item.start + MIN_SPAN_MINUTES) }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));

  let cluster: { id: string; col: number }[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const cols = columnEnds.length;
    for (const entry of cluster) result.set(entry.id, { id: entry.id, col: entry.col, cols });
    cluster = [];
    columnEnds = [];
    clusterEnd = -Infinity;
  };

  for (const item of sorted) {
    if (item.start >= clusterEnd) flush();
    let col = columnEnds.findIndex((end) => end <= item.start);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(item.end);
    } else {
      columnEnds[col] = item.end;
    }
    cluster.push({ id: item.id, col });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();

  return result;
}

/** Vertical placement of a block in a grid that starts at `gridStart` minutes. */
export function blockGeometry(
  start: number,
  end: number,
  gridStart: number,
  pxPerMinute: number,
): { top: number; height: number } {
  const top = (start - gridStart) * pxPerMinute;
  const height = Math.max((end - start) * pxPerMinute, MIN_SPAN_MINUTES * pxPerMinute * 0.8);
  return { top, height };
}
