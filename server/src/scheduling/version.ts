import { createHash } from 'node:crypto';

export interface VersionRow {
  id: string;
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
}

/** sha256 over the sorted "id|doctorId|startsAt|endsAt|status" lines of a day. */
export function scheduleVersion(rows: VersionRow[]): string {
  const lines = rows
    .map(
      (r) =>
        `${r.id}|${r.doctorId}|${r.startsAt.toISOString()}|${r.endsAt.toISOString()}|${r.status}`,
    )
    .sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}
