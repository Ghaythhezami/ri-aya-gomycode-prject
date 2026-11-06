import type { DeliveryStats, NotificationPage } from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

export interface NotificationListArgs {
  unread?: boolean;
  cursor?: string;
  limit?: number;
}

const notificationsApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    notificationsList: build.query<NotificationPage, NotificationListArgs>({
      query: ({ unread, cursor, limit = 30 }) => ({
        url: '/api/notifications',
        params: { ...(unread ? { unread: 'true' } : {}), ...(cursor ? { cursor } : {}), limit },
      }),
      providesTags: ['Notification'],
    }),
    unreadNotificationCount: build.query<{ count: number }, void>({
      query: () => ({ url: '/api/notifications/unread-count' }),
      providesTags: ['Notification'],
    }),
    notificationDeliveryStats: build.query<DeliveryStats, void>({
      query: () => ({ url: '/api/notifications/delivery-stats' }),
      providesTags: ['Notification'],
    }),
    markNotificationRead: build.mutation<{ success: true }, string>({
      query: (id) => ({ url: `/api/notifications/${id}/read`, method: 'POST' }),
      invalidatesTags: ['Notification'],
    }),
    markAllNotificationsRead: build.mutation<{ updated: number }, void>({
      query: () => ({ url: '/api/notifications/read-all', method: 'POST' }),
      invalidatesTags: ['Notification'],
    }),
  }),
});

export const {
  useNotificationsListQuery,
  useLazyNotificationsListQuery,
  useUnreadNotificationCountQuery,
  useNotificationDeliveryStatsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} = notificationsApi;
