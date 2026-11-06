import type { QueueEntryDto, QueuePriority, QueueSnapshot } from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

const INVALIDATES = ['Queue', 'Appointment', 'Dashboard', 'Schedule'] as const;

export const queueApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    queue: build.query<QueueSnapshot, void>({
      query: () => ({ url: '/api/queue' }),
      providesTags: ['Queue'],
    }),
    checkIn: build.mutation<QueueEntryDto, { appointmentId: string; priority?: QueuePriority }>({
      query: (body) => ({ url: '/api/queue/check-in', method: 'POST', body }),
      invalidatesTags: [...INVALIDATES],
    }),
    callNext: build.mutation<QueueEntryDto, { doctorId?: string } | void>({
      query: (body) => ({ url: '/api/queue/call-next', method: 'POST', body: body ?? {} }),
      invalidatesTags: [...INVALIDATES],
    }),
    startConsultation: build.mutation<QueueEntryDto, string>({
      query: (id) => ({ url: `/api/queue/${id}/start`, method: 'POST' }),
      invalidatesTags: [...INVALIDATES],
    }),
    completeConsultation: build.mutation<QueueEntryDto, string>({
      query: (id) => ({ url: `/api/queue/${id}/complete`, method: 'POST' }),
      invalidatesTags: [...INVALIDATES],
    }),
    markNoShow: build.mutation<QueueEntryDto, string>({
      query: (id) => ({ url: `/api/queue/${id}/no-show`, method: 'POST' }),
      invalidatesTags: [...INVALIDATES],
    }),
    notifyDelay: build.mutation<QueueEntryDto, { id: string; minutes: number }>({
      query: ({ id, minutes }) => ({
        url: `/api/queue/${id}/notify-delay`,
        method: 'POST',
        body: { minutes },
      }),
      invalidatesTags: ['Queue', 'Notification'],
    }),
    setPriority: build.mutation<QueueEntryDto, { id: string; priority: QueuePriority }>({
      query: ({ id, priority }) => ({
        url: `/api/queue/${id}/priority`,
        method: 'POST',
        body: { priority },
      }),
      invalidatesTags: ['Queue'],
    }),
  }),
});

export const {
  useQueueQuery,
  useCheckInMutation,
  useCallNextMutation,
  useStartConsultationMutation,
  useCompleteConsultationMutation,
  useMarkNoShowMutation,
  useNotifyDelayMutation,
  useSetPriorityMutation,
} = queueApi;
