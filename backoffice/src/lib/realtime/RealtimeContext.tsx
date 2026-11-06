import { createContext, useContext, useEffect, useRef } from 'react';
import type { RealtimeEventName, RealtimeHandler, RealtimeStatus } from './types';

export interface RealtimeContextValue {
  status: RealtimeStatus;
  subscribe: <K extends RealtimeEventName>(name: K, handler: RealtimeHandler<K>) => () => void;
}

/** Outside a provider (public screens, tests) realtime simply reads as disabled. */
export const RealtimeContext = createContext<RealtimeContextValue>({
  status: 'disabled',
  subscribe: () => () => undefined,
});

export function useRealtimeStatus(): RealtimeStatus {
  return useContext(RealtimeContext).status;
}

/** Subscribe to a socket event for the lifetime of the component; the latest handler always runs. */
export function useRealtimeEvent<K extends RealtimeEventName>(
  name: K,
  handler: RealtimeHandler<K>,
): void {
  const { subscribe } = useContext(RealtimeContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => subscribe(name, (payload) => latest.current(payload)), [subscribe, name]);
}
