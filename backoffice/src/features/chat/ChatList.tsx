import { useTranslation } from 'react-i18next';
import type { ConversationDto } from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../shared/Avatar';
import { useClinicFormat } from '../shared/format';
import { relativeTime } from '../notifications/templates';
import { conversationTitle } from './chatMerge';

export function ChatList({
  conversations,
  onOpen,
}: {
  conversations: ConversationDto[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const fmt = useClinicFormat();
  const { user } = useAuth();
  const meId = user?.id;
  const sorted = [...conversations].sort((a, b) =>
    (b.lastMessage?.createdAt ?? '').localeCompare(a.lastMessage?.createdAt ?? ''),
  );
  return (
    <ul>
      {sorted.map((c) => {
        const title = conversationTitle(c, meId, t('chat.untitled'));
        const other = c.members.find((m) => m.id !== meId) ?? c.members[0];
        const mine = c.lastMessage?.senderId === meId;
        return (
          <li key={c.id} className="border-b border-border last:border-b-0">
            <button
              type="button"
              onClick={() => onOpen(c.id)}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-start hover:bg-bg"
            >
              <Avatar initials={c.isGroup ? '#' : (other?.initials ?? '?')} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span
                    className={`truncate text-sm ${c.unread > 0 ? 'font-semibold' : 'font-medium'} text-text`}
                  >
                    {title}
                  </span>
                  {c.lastMessage && (
                    <span className="shrink-0 text-[11px] text-muted">
                      {relativeTime(
                        c.lastMessage.createdAt,
                        Date.now(),
                        fmt.locale === 'ar' ? 'ar-u-nu-latn' : fmt.locale,
                      )}
                    </span>
                  )}
                </span>
                <span dir="auto" className="block truncate text-xs text-muted">
                  {c.lastMessage
                    ? `${mine ? `${t('chat.you')}: ` : ''}${c.lastMessage.body}`
                    : t('chat.noMessages')}
                </span>
              </span>
              {c.unread > 0 && (
                <span
                  aria-label={t('chat.unreadCount', { count: c.unread })}
                  className="grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-white"
                >
                  {c.unread}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
