const KEY = 'riaya.portal.clinic';

export interface RememberedClinic {
  id: string;
  name: string;
  timezone: string;
}

export function readRememberedClinic(
  storage: Pick<Storage, 'getItem'> = localStorage,
): RememberedClinic | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<RememberedClinic>;
    if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;
    return { id: value.id, name: value.name, timezone: value.timezone || 'UTC' };
  } catch {
    return null;
  }
}

export function rememberClinic(
  clinic: RememberedClinic,
  storage: Pick<Storage, 'setItem'> = localStorage,
) {
  try {
    storage.setItem(KEY, JSON.stringify(clinic));
  } catch {
    /* private mode: remembering is a convenience only */
  }
}
