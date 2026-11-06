import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken } from '../../lib/api';

const EVENTS = [
  'queue.updated',
  'appointment.created',
  'appointment.cancelled',
  'appointment.rescheduled',
  'appointment.updated',
] as const;

/**
 * Optional realtime channel. When `VITE_REALTIME_URL` is set it connects with the
 * access token and calls `onEvent` on queue/appointment events and after every
 * reconnect (to catch up). `paused` is true while disconnected so the screen can
 * say live updates are paused; polling keeps running as the fallback either way.
 */
export function useLiveSocket(onEvent: () => void): { enabled: boolean; paused: boolean } {
  const url = import.meta.env.VITE_REALTIME_URL as string | undefined;
  const [paused, setPaused] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!url) return;
    const socket = io(url, {
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ['websocket', 'polling'],
    });
    let hadConnection = false;
    socket.on('connect', () => {
      setPaused(false);
      if (hadConnection) handler.current();
      hadConnection = true;
    });
    socket.on('disconnect', () => setPaused(true));
    socket.on('connect_error', () => setPaused(true));
    for (const name of EVENTS) socket.on(name, () => handler.current());
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [url]);

  return { enabled: Boolean(url), paused: Boolean(url) && paused };
}
