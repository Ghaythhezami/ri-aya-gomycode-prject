import type { NotificationDto, SocketEventName } from '@riaya/shared';

/**
 * connected: live; connecting: trying; offline: lost or refused (polling takes over);
 * disabled: realtime not configured on the server, or nobody is signed in.
 */
export type RealtimeStatus = 'connected' | 'connecting' | 'offline' | 'disabled';

/** Raw message as the comms service sends it (no sender name, only the id). */
export interface RealtimeChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  readBy?: string[];
  readByOthers: boolean;
  createdAt: string;
}

export interface RealtimeEventMap {
  'notification.created': { notification: NotificationDto; unreadCount: number | null };
  'notification.read': { unreadCount: number };
  'chat.message': { conversationId: string; message: RealtimeChatMessage };
  'chat.read': { conversationId: string; userId: string };
  'queue.updated': Record<string, unknown>;
  'appointment.created': Record<string, unknown>;
  'appointment.updated': Record<string, unknown>;
  'appointment.cancelled': Record<string, unknown>;
  'appointment.rescheduled': Record<string, unknown>;
  /** Synthetic: the socket connected again after a drop; refetch what may have been missed. */
  reconnected: undefined;
}

export type RealtimeEventName = SocketEventName | 'reconnected';

export type RealtimeHandler<K extends RealtimeEventName> = (payload: RealtimeEventMap[K]) => void;
