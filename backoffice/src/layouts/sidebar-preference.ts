const STORAGE_KEY = 'riaya.sidebar.collapsed';

/**
 * The desktop sidebar's collapsed preference (AC-001).
 *
 * Storage can be unavailable (private mode, disabled cookies). The shell must
 * default to expanded and never throw, so every access is guarded.
 */
export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // Storage unavailable: the choice simply does not persist.
  }
}
