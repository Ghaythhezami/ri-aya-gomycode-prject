import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useClinicFormat } from './format';
import { isValidPeriod, periodRange, type DateRange } from './period';

const STORAGE_KEY = 'riaya.period';

function readStored(): DateRange | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DateRange>;
    const range = { from: String(parsed.from), to: String(parsed.to) };
    return isValidPeriod(range) ? range : null;
  } catch {
    return null;
  }
}

/**
 * The selected period: `?from=&to=` in the URL, else the one remembered for this session,
 * else today. Changing it updates both.
 */
export function usePeriod(): {
  period: DateRange;
  today: string;
  setPeriod: (range: DateRange) => void;
} {
  const fmt = useClinicFormat();
  const today = fmt.localDate();
  const [params, setParams] = useSearchParams();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  const period = useMemo<DateRange>(() => {
    const fromUrl = { from, to };
    if (isValidPeriod(fromUrl)) return fromUrl;
    return readStored() ?? periodRange('today', today);
  }, [from, to, today]);

  const setPeriod = useCallback(
    (range: DateRange) => {
      if (!isValidPeriod(range)) return;
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(range));
      } catch {
        /* storage unavailable: the choice just is not remembered */
      }
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('from', range.from);
          next.set('to', range.to);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { period, today, setPeriod };
}
