import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_EVENTS, type RealtimeTicket } from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { useAppDispatch } from '../../store/hooks';
import { clinicApi, type CLINIC_TAGS } from '../../store/clinicApi';
import { api } from '../api';
import { backoffDelay } from './backoff';
import { RealtimeContext, type RealtimeContextValue } from './RealtimeContext';
import type { RealtimeEventName, RealtimeHandler, RealtimeStatus } from './types';

type AnyHandler = (payload: unknown) => void;
type Tag = (typeof CLINIC_TAGS)[number];

/**
 * Tags to refetch when a domain event arrives. Notifications and chat patch their own cache
 * (feature `useRealtimeSync` hooks); the queue screen refetches itself through `useLiveSocket`,
 * so `Queue` is not invalidated here to avoid a double request.
 */
const DOMAIN_TAGS: Partial<Record<RealtimeEventName, Tag[]>> = {
  'appointment.created': ['Appointment', 'Schedule', 'Dashboard'],
  'appointment.updated': ['Appointment', 'Schedule', 'Dashboard'],
  'appointment.cancelled': ['Appointment', 'Schedule', 'Dashboard'],
  'appointment.rescheduled': ['Appointment', 'Schedule', 'Dashboard'],
  'queue.updated': ['Dashboard'],
  reconnected: ['Notification', 'Chat', 'Appointment', 'Schedule', 'Dashboard'],
};

/**
 * Opens the Socket.IO connection while someone is signed in (ADR 0004 section 4).
 *
 * Each (re)connect fetches a fresh one-time ticket (60 s) through the socket `auth` callback.
 * A refused ticket is not retried by Socket.IO itself, so those retries use our own
 * exponential backoff. A clinic switch reloads the page, which tears the socket down.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState<RealtimeStatus>('disabled');
  const listeners = useRef(new Map<RealtimeEventName, Set<AnyHandler>>());

  const subscribe = useMemo<RealtimeContextValue['subscribe']>(
    () =>
      <K extends RealtimeEventName>(name: K, handler: RealtimeHandler<K>) => {
        const set = listeners.current.get(name) ?? new Set<AnyHandler>();
        set.add(handler as AnyHandler);
        listeners.current.set(name, set);
        return () => {
          set.delete(handler as AnyHandler);
        };
      },
    [],
  );

  useEffect(() => {
    if (!userId) {
      setStatus('disabled');
      return undefined;
    }
    let disposed = false;
    let socket: Socket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let hadConnection = false;
    let firstTicket: RealtimeTicket | null = null;

    const emit = (name: RealtimeEventName, payload: unknown) => {
      const tags = DOMAIN_TAGS[name];
      if (tags) dispatch(clinicApi.util.invalidateTags(tags));
      for (const handler of [...(listeners.current.get(name) ?? [])]) handler(payload);
    };
    const retryLater = (fn: () => void) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!disposed) fn();
      }, backoffDelay(attempt));
      attempt += 1;
    };
    const fetchTicket = async () => (await api.post<RealtimeTicket>('/api/realtime/ticket')).data;

    const start = async () => {
      setStatus('connecting');
      let ticket: RealtimeTicket;
      try {
        ticket = await fetchTicket();
      } catch (error) {
        if (disposed) return;
        const code = (error as { response?: { status?: number } }).response?.status;
        if (code === 401 || code === 403 || code === 404) {
          setStatus('disabled');
          return;
        }
        setStatus('offline');
        retryLater(() => void start());
        return;
      }
      if (disposed) return;
      if (!ticket.url || !ticket.ticket) {
        setStatus('disabled');
        return;
      }
      firstTicket = ticket;
      const s = io(ticket.url, {
        path: ticket.path,
        transports: ['websocket', 'polling'],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30_000,
        auth: (cb) => {
          const pre = firstTicket;
          firstTicket = null;
          if (pre?.ticket) {
            cb({ ticket: pre.ticket });
            return;
          }
          fetchTicket()
            .then((fresh) => cb({ ticket: fresh.ticket }))
            .catch(() => cb({}));
        },
      });
      socket = s;
      s.on('connect', () => {
        attempt = 0;
        setStatus('connected');
        if (hadConnection) emit('reconnected', undefined);
        hadConnection = true;
      });
      s.on('disconnect', (reason) => {
        setStatus('offline');
        if (reason === 'io server disconnect') retryLater(() => s.connect());
      });
      s.on('connect_error', () => {
        setStatus('offline');
        if (!s.active) retryLater(() => s.connect());
      });
      s.io.on('reconnect_attempt', () => setStatus('connecting'));
      for (const name of SOCKET_EVENTS) s.on(name, (payload: unknown) => emit(name, payload));
    };

    void start();
    return () => {
      disposed = true;
      clearTimeout(timer);
      socket?.removeAllListeners();
      socket?.io.removeAllListeners();
      socket?.disconnect();
      setStatus('disabled');
    };
  }, [userId, dispatch]);

  const value = useMemo<RealtimeContextValue>(() => ({ status, subscribe }), [status, subscribe]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
