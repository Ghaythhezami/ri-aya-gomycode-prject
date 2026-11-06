import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Plus, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../common/Button';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { useAppearanceBootstrap } from '../settings/appearance';
import { useAdaptivePolling } from '../../lib/realtime';
import { useChatConversationsQuery } from './api';
import { totalUnread } from './chatMerge';
import { ChatList } from './ChatList';
import { ChatThread } from './ChatThread';
import { NewConversation } from './NewConversation';
import { useChatRealtimeSync } from './useChatRealtimeSync';
import { canUser } from '../../auth/permissions';

type View = { name: 'list' } | { name: 'new' } | { name: 'thread'; id: string };

/** RT-2: floating chat button with unread badge, opening a conversation drawer. */
export function ChatLauncher() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const allowed = canUser(user, 'viewChat');
  // The launcher is mounted on every authenticated screen, so it also applies the saved appearance.
  useAppearanceBootstrap();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ name: 'list' });
  const launcher = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useChatRealtimeSync();
  const pollingInterval = useAdaptivePolling(15_000, 60_000);
  const conversations = useChatConversationsQuery(undefined, {
    skip: !allowed,
    pollingInterval,
    skipPollingIfUnfocused: true,
  });
  const list = conversations.data ?? [];
  const unread = totalUnread(list);

  useEffect(() => {
    if (!open) return undefined;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        launcher.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!allowed) return null;

  const active = view.name === 'thread' ? list.find((c) => c.id === view.id) : undefined;

  return (
    <>
      <button
        ref={launcher}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('chat.open', { count: unread })}
        className="fixed bottom-4 end-4 z-30 grid size-14 place-items-center rounded-full bg-primary text-white shadow-(--shadow-overlay) hover:bg-primary-dark"
      >
        <MessageCircle size={24} aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -end-1 -top-1 grid min-w-6 place-items-center rounded-full bg-error px-1 text-xs font-semibold leading-6 text-white"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
        <span className="sr-only" aria-live="polite">
          {t('chat.unreadLive', { count: unread })}
        </span>
      </button>

      {open && (
        <section
          role="dialog"
          aria-label={t('chat.title')}
          className="fixed inset-0 z-40 flex flex-col bg-surface shadow-(--shadow-overlay) sm:inset-auto sm:bottom-4 sm:end-4 sm:h-[min(36rem,calc(100vh-2rem))] sm:w-96 sm:rounded-lg sm:border sm:border-border"
        >
          {view.name === 'thread' && active ? (
            <ChatThread
              key={active.id}
              conversation={active}
              onBack={() => setView({ name: 'list' })}
            />
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-text">
                  {view.name === 'new' ? t('chat.newConversation') : t('chat.title')}
                </h2>
                <div className="flex items-center gap-1">
                  {view.name === 'list' && (
                    <Button variant="secondary" size="sm" onClick={() => setView({ name: 'new' })}>
                      <Plus size={14} aria-hidden="true" />
                      {t('chat.new')}
                    </Button>
                  )}
                  <button
                    ref={closeButton}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      launcher.current?.focus();
                    }}
                    aria-label={t('clinic.close')}
                    className="grid size-10 place-items-center rounded-md text-text hover:bg-accent"
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {view.name === 'new' ? (
                  <NewConversation
                    onCancel={() => setView({ name: 'list' })}
                    onCreated={(id) => setView({ name: 'thread', id })}
                  />
                ) : conversations.isLoading ? (
                  <div className="space-y-2 p-4" aria-busy="true">
                    <Skeleton className="h-14" />
                    <Skeleton className="h-14" />
                    <Skeleton className="h-14" />
                  </div>
                ) : conversations.isError && !conversations.data ? (
                  <div className="p-4">
                    <ErrorState
                      title={t('chat.loadError')}
                      action={
                        <Button variant="secondary" onClick={() => void conversations.refetch()}>
                          {t('clinic.retry')}
                        </Button>
                      }
                    />
                  </div>
                ) : list.length === 0 ? (
                  <div className="p-4">
                    <EmptyState
                      title={t('chat.empty.title')}
                      description={t('chat.empty.body')}
                      action={
                        <Button onClick={() => setView({ name: 'new' })}>
                          {t('chat.newConversation')}
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <ChatList conversations={list} onOpen={(id) => setView({ name: 'thread', id })} />
                )}
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
