import { useStore } from 'react-redux';
import { useAuth } from '../../auth/AuthContext';
import { useRealtimeEvent } from '../../lib/realtime';
import { useAppDispatch } from '../../store/hooks';
import type { RootState } from '../../store/store';
import { chatApi } from './api';
import { PAGE_SIZE } from './chatMerge';
import {
  addMessageToPage,
  applyIncomingMessage,
  clearUnread,
  markOwnMessagesRead,
  toChatMessage,
} from './realtimeCache';

/**
 * Mounted once (by the launcher) to keep chat in step with the socket.
 *
 * - `chat.message`: resolve the sender from the cached members, append to the first page of
 *   that thread and update the conversation row and unread badge. Unknown conversation or
 *   sender: invalidate `Chat` so the lists refetch.
 * - `chat.read`: mine clears the badge; a colleague's marks my messages as read.
 */
export function useChatRealtimeSync(): void {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const { user } = useAuth();
  const meId = user?.id;

  useRealtimeEvent('chat.message', ({ conversationId, message }) => {
    const conversations = chatApi.endpoints.chatConversations.select()(store.getState()).data;
    const conversation = conversations?.find((c) => c.id === conversationId);
    const mapped = conversation ? toChatMessage(message, conversation) : null;
    if (!mapped) {
      dispatch(chatApi.util.invalidateTags(['Chat']));
      return;
    }
    dispatch(
      chatApi.util.updateQueryData('chatConversations', undefined, (draft) =>
        applyIncomingMessage(draft, mapped, meId),
      ),
    );
    dispatch(
      chatApi.util.updateQueryData('chatMessages', { conversationId, limit: PAGE_SIZE }, (draft) =>
        addMessageToPage(draft, mapped),
      ),
    );
  });

  useRealtimeEvent('chat.read', ({ conversationId, userId }) => {
    if (userId === meId) {
      dispatch(
        chatApi.util.updateQueryData('chatConversations', undefined, (draft) =>
          clearUnread(draft, conversationId),
        ),
      );
      return;
    }
    dispatch(
      chatApi.util.updateQueryData('chatMessages', { conversationId, limit: PAGE_SIZE }, (draft) =>
        markOwnMessagesRead(draft, meId),
      ),
    );
  });
}
