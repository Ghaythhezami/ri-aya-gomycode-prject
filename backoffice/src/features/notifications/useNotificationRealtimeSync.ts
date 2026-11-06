import { useStore } from 'react-redux';
import type { NotificationDto } from '@riaya/shared';
import { useRealtimeEvent } from '../../lib/realtime';
import type { RootState } from '../../store/store';
import { useAppDispatch } from '../../store/hooks';
import { notificationsApi } from './api';
import { addNotificationToPage, bumpCount, markPageRead } from './liveLogic';

/**
 * Mounted once (by the bell) to keep the notification cache in step with the socket.
 *
 * - `notification.created`: prepend to every cached first-page list, set the unread count
 *   (a `null` count means a broadcast: add one, then refetch to get the per-user value).
 * - `notification.read`: set the unread count; 0 marks every cached item read, any other
 *   change that this tab did not cause refetches the lists.
 */
export function useNotificationRealtimeSync(onCreated?: (n: NotificationDto) => void): void {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();

  const cachedLists = () =>
    notificationsApi.util.selectCachedArgsForQuery(store.getState(), 'notificationsList');
  const cachedCount = () =>
    notificationsApi.endpoints.unreadNotificationCount.select()(store.getState()).data?.count;

  useRealtimeEvent('notification.created', ({ notification, unreadCount }) => {
    for (const args of cachedLists()) {
      dispatch(
        notificationsApi.util.updateQueryData('notificationsList', args, (draft) =>
          addNotificationToPage(draft, notification, args, unreadCount),
        ),
      );
    }
    dispatch(
      notificationsApi.util.updateQueryData('unreadNotificationCount', undefined, (draft) => {
        draft.count = unreadCount ?? bumpCount(draft.count);
      }),
    );
    if (unreadCount === null) dispatch(notificationsApi.util.invalidateTags(['Notification']));
    onCreated?.(notification);
  });

  useRealtimeEvent('notification.read', ({ unreadCount }) => {
    const before = cachedCount();
    dispatch(
      notificationsApi.util.updateQueryData('unreadNotificationCount', undefined, (draft) => {
        draft.count = unreadCount;
      }),
    );
    if (unreadCount === 0) {
      for (const args of cachedLists()) {
        dispatch(
          notificationsApi.util.updateQueryData('notificationsList', args, (draft) =>
            markPageRead(draft, 'all', 0),
          ),
        );
      }
    } else if (before !== undefined && before !== unreadCount) {
      dispatch(notificationsApi.util.invalidateTags(['Notification']));
    }
  });
}
