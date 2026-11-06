import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowLeft, CheckCheck, Loader2, Send } from 'lucide-react';
import type { ChatMessageDto, ConversationDto } from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { Skeleton } from '../../common/Skeleton';
import { useAdaptivePolling } from '../../lib/realtime';
import { asClinicError } from '../../store/clinicApi';
import { useClinicFormat } from '../shared/format';
import {
  useChatMarkReadMutation,
  useChatMessagesQuery,
  useChatSendMessageMutation,
  useLazyChatMessagesQuery,
} from './api';
import {
  MAX_MESSAGE_LENGTH,
  PAGE_SIZE,
  conversationTitle,
  lastOwnMessageId,
  mergeMessages,
  prepareBody,
  shouldSend,
} from './chatMerge';

/** One open conversation: infinite scroll upwards, 4 s polling, composer. */
export function ChatThread({
  conversation,
  onBack,
}: {
  conversation: ConversationDto;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useClinicFormat();
  const { user } = useAuth();
  const meId = user?.id;
  const id = conversation.id;

  const pollingInterval = useAdaptivePolling(4000, 60_000);
  const first = useChatMessagesQuery(
    { conversationId: id, limit: PAGE_SIZE },
    { pollingInterval, skipPollingIfUnfocused: true },
  );
  const [loadOlder, olderState] = useLazyChatMessagesQuery();
  const [send, sendState] = useChatSendMessageMutation();
  const [markRead] = useChatMarkReadMutation();

  const [older, setOlder] = useState<{ items: ChatMessageDto[]; next: string | null | undefined }>({
    items: [],
    next: undefined,
  });
  const [sent, setSent] = useState<ChatMessageDto[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hasNew, setHasNew] = useState(false);

  const nextCursor = older.next === undefined ? (first.data?.nextCursor ?? null) : older.next;
  const messages = useMemo(
    () => mergeMessages(older.items, first.data?.items ?? [], sent),
    [older.items, first.data, sent],
  );
  const lastOwn = lastOwnMessageId(messages, meId);
  const latestId = messages[messages.length - 1]?.id;
  const latestFromOthers = messages[messages.length - 1]?.sender.id !== meId;

  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const restore = useRef<{ height: number; top: number } | null>(null);
  const seenLatest = useRef<string | undefined>(undefined);

  // Mark read when opened and whenever a new message from someone else arrives.
  useEffect(() => {
    if (latestId && latestFromOthers) void markRead(id);
  }, [id, latestId, latestFromOthers, markRead]);
  useEffect(() => {
    void markRead(id);
  }, [id, markRead]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (restore.current) {
      el.scrollTop = el.scrollHeight - restore.current.height + restore.current.top;
      restore.current = null;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    } else if (latestId !== seenLatest.current && seenLatest.current && latestFromOthers) {
      // Scrolled up while a live message arrived: keep the position and offer a jump.
      setHasNew(true);
    }
    seenLatest.current = latestId;
  }, [messages, latestId, latestFromOthers]);

  const jumpToLatest = () => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    stick.current = true;
    setHasNew(false);
  };

  const fetchOlder = useCallback(async () => {
    if (!nextCursor || olderState.isFetching) return;
    const el = scroller.current;
    if (el) restore.current = { height: el.scrollHeight, top: el.scrollTop };
    try {
      const page = await loadOlder({
        conversationId: id,
        before: nextCursor,
        limit: PAGE_SIZE,
      }).unwrap();
      setOlder((current) => ({
        items: mergeMessages(current.items, page.items),
        next: page.nextCursor,
      }));
    } catch (e) {
      restore.current = null;
      setError(
        t(`errors.${asClinicError(e)?.code ?? 'INTERNAL_ERROR'}`, {
          defaultValue: asClinicError(e)?.message ?? '',
        }),
      );
    }
  }, [nextCursor, olderState.isFetching, loadOlder, id, t]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (stick.current) setHasNew(false);
    if (el.scrollTop < 40 && nextCursor) void fetchOlder();
  };

  const submit = async () => {
    const body = prepareBody(draft);
    if (!body || sendState.isLoading) return;
    setError(null);
    try {
      const message = await send({ conversationId: id, body }).unwrap();
      setSent((current) => mergeMessages(current, [message]));
      setDraft('');
      stick.current = true;
    } catch (e) {
      // The draft stays in the box so nothing typed is lost.
      setError(
        t(`errors.${asClinicError(e)?.code ?? 'INTERNAL_ERROR'}`, {
          defaultValue: asClinicError(e)?.message ?? t('chat.sendError'),
        }),
      );
    }
  };

  const title = conversationTitle(conversation, meId, t('chat.untitled'));
  const remaining = MAX_MESSAGE_LENGTH - draft.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('clinic.back')}
          className="grid size-10 place-items-center rounded-md text-text hover:bg-accent"
        >
          <ArrowLeft size={18} aria-hidden="true" className="rtl:-scale-x-100" />
        </button>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{title}</h3>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scroller}
          onScroll={onScroll}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-bg px-3 py-3"
          role="log"
          aria-label={title}
          aria-live="polite"
          tabIndex={0}
        >
          {first.isLoading && (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="ms-auto h-10 w-1/2" />
              <Skeleton className="h-10 w-3/4" />
            </div>
          )}
          {first.isError && !first.data && (
            <p role="alert" className="text-center text-sm text-error">
              {t('chat.loadError')}{' '}
              <button
                type="button"
                className="font-medium underline"
                onClick={() => void first.refetch()}
              >
                {t('clinic.retry')}
              </button>
            </p>
          )}
          {nextCursor && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void fetchOlder()}
                disabled={olderState.isFetching}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-primary hover:bg-accent"
              >
                {olderState.isFetching && (
                  <Loader2
                    size={14}
                    aria-hidden="true"
                    className="animate-spin motion-reduce:animate-none"
                  />
                )}
                {t('chat.loadEarlier')}
              </button>
            </div>
          )}
          {first.data && messages.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">{t('chat.noMessages')}</p>
          )}
          {messages.map((m) => {
            const mine = m.sender.id === meId;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                {!mine && conversation.isGroup && (
                  <span className="mb-0.5 px-1 text-xs text-muted">{m.sender.name}</span>
                )}
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    mine ? 'bg-primary text-white' : 'border border-border bg-surface text-text'
                  }`}
                >
                  {/* Text only, never HTML; dir="auto" lets Arabic render right-to-left inside the bubble. */}
                  <p dir="auto" className="whitespace-pre-wrap break-words">
                    {m.body}
                  </p>
                </div>
                <span className="mt-0.5 flex items-center gap-1 px-1 text-[11px] text-muted">
                  <span dir="ltr">{fmt.time(m.createdAt)}</span>
                  {mine && m.id === lastOwn && m.readByOthers && (
                    <span className="inline-flex items-center gap-0.5 text-primary">
                      <CheckCheck size={12} aria-hidden="true" />
                      {t('chat.read')}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        {hasNew && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute inset-x-0 bottom-3 mx-auto inline-flex min-h-10 w-fit items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-medium text-white shadow-(--shadow-overlay) hover:bg-primary-dark"
          >
            <ArrowDown size={14} aria-hidden="true" />
            {t('chat.newMessages')}
          </button>
        )}
      </div>

      <div className="border-t border-border bg-surface p-3">
        {error && (
          <p role="alert" className="mb-2 text-xs text-error">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor={`chat-composer-${id}`}>
            {t('chat.composer')}
          </label>
          <textarea
            id={`chat-composer-${id}`}
            dir="auto"
            rows={2}
            value={draft}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={t('chat.placeholder')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (
                shouldSend({
                  key: e.key,
                  shiftKey: e.shiftKey,
                  isComposing: e.nativeEvent.isComposing,
                })
              ) {
                e.preventDefault();
                void submit();
              }
            }}
            className="min-h-11 flex-1 resize-none rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder:text-muted"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!prepareBody(draft) || sendState.isLoading}
            aria-label={t('chat.send')}
            className="grid size-11 shrink-0 place-items-center rounded-md bg-primary text-white hover:bg-primary-dark disabled:opacity-60"
          >
            <Send size={18} aria-hidden="true" className="rtl:-scale-x-100" />
          </button>
        </div>
        <p
          className={`mt-1 text-end text-[11px] ${remaining < 100 ? 'text-warning' : 'text-muted'}`}
          aria-live="polite"
          dir="ltr"
        >
          {draft.length}/{MAX_MESSAGE_LENGTH}
        </p>
      </div>
    </div>
  );
}
