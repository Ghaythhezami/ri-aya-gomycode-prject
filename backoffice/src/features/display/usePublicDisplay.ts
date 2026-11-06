import { useEffect, useState } from 'react';
import type { PublicDisplay } from '@riaya/shared';
import { fetchPublicDisplay } from './api';

/** Poll the public feed every 5 s; a failed poll flags `lost` and the next success clears it. */
export function usePublicDisplay(clinicId: string | undefined, intervalMs = 5000) {
  const [data, setData] = useState<PublicDisplay | null>(null);
  const [lost, setLost] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clinicId) return;
    let stopped = false;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const next = await fetchPublicDisplay(clinicId, controller.signal);
        if (stopped) return;
        setData(next);
        setLost(false);
      } catch {
        if (!stopped) setLost(true);
      } finally {
        if (!stopped) setLoading(false);
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), intervalMs);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(id);
    };
  }, [clinicId, intervalMs]);

  return { data, lost, loading };
}
