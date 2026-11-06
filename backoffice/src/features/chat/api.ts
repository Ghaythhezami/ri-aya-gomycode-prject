import type { ChatMessageDto, ConversationDto, CursorPage, PersonRef } from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';
import { PAGE_SIZE } from './chatMerge';

export interface ChatMessagesArgs {
  conversationId: string;
  before?: string;
  limit?: number;
}

export const chatApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    chatConversations: build.query<ConversationDto[], void>({
      query: () => ({ url: '/api/chat/conversations' }),
      providesTags: ['Chat'],
    }),
    chatStaff: build.query<PersonRef[], void>({
      query: () => ({ url: '/api/chat/staff' }),
    }),
    chatMessages: build.query<CursorPage<ChatMessageDto>, ChatMessagesArgs>({
      query: ({ conversationId, before, limit = PAGE_SIZE }) => ({
        url: `/api/chat/conversations/${conversationId}/messages`,
        params: { ...(before ? { before } : {}), limit },
      }),
      providesTags: ['Chat'],
    }),
    chatCreateConversation: build.mutation<
      ConversationDto,
      { memberIds: string[]; title?: string }
    >({
      query: (body) => ({ url: '/api/chat/conversations', method: 'POST', body }),
      invalidatesTags: ['Chat'],
    }),
    chatSendMessage: build.mutation<ChatMessageDto, { conversationId: string; body: string }>({
      query: ({ conversationId, body }) => ({
        url: `/api/chat/conversations/${conversationId}/messages`,
        method: 'POST',
        body: { body },
      }),
      invalidatesTags: ['Chat'],
    }),
    chatMarkRead: build.mutation<{ success: true }, string>({
      query: (id) => ({ url: `/api/chat/conversations/${id}/read`, method: 'POST' }),
      invalidatesTags: ['Chat'],
    }),
  }),
});

export const {
  useChatConversationsQuery,
  useChatStaffQuery,
  useChatMessagesQuery,
  useLazyChatMessagesQuery,
  useChatCreateConversationMutation,
  useChatSendMessageMutation,
  useChatMarkReadMutation,
} = chatApi;
