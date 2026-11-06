import { useEffect } from 'react';

/**
 * Warn before leaving with unsaved work. The app uses `BrowserRouter`, so `useBlocker` is
 * unavailable: a capture-phase click listener asks before an in-app anchor navigates, and
 * `beforeunload` covers reloads and tab close.
 */
export function useUnsavedGuard(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return undefined;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!anchor) return;
      const target = anchor.getAttribute('target');
      if (target && target !== '_self') return;
      const href = anchor.getAttribute('href') ?? '';
      if (href.startsWith('#')) return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, message]);
}
