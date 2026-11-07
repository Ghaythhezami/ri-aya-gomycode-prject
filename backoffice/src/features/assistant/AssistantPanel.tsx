import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  CircleAlert,
  History,
  LayoutList,
  Loader2,
  Plus,
  Send,
  Square,
  Trash2,
} from 'lucide-react';
import type { AssistantChatInput, AssistantPersona } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState } from '../../common/States';
import type { AssistantClient } from './client';
import { MarkdownText } from './MarkdownText';
import { ProposalCard } from './ProposalCard';
import { PromptTemplates } from './PromptTemplates';
import { firstBlank } from './templateCatalogue';
import {
  useAssistantChat,
  useConversations,
  type ChatMessage,
  type ToolActivity,
} from './useAssistantChat';

export interface AssistantPanelProps {
  persona: AssistantPersona;
  client: AssistantClient;
  /** Staff page context (patient id, date). Ignored for patients. */
  context?: AssistantChatInput['context'];
  /** Status reason when the assistant cannot be used (e.g. CONSENT_REQUIRED, NOT_CONFIGURED). */
  blockedReason?: string | null;
  /** Where the patient gives AI consent. */
  consentHref?: string;
  /** Called after a confirmed proposal changed data. */
  onChanged?: () => void;
  className?: string;
}

function ToolChip({ tool }: { tool: ToolActivity }) {
  const { t } = useTranslation();
  const key = tool.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const label = t(`assistant.tool.${key}`, { defaultValue: t('assistant.tool.generic') });
  return (
    <li className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 text-xs text-muted">
      {tool.status === 'running' ? (
        <Loader2 size={12} aria-hidden="true" className="motion-safe:animate-spin" />
      ) : tool.status === 'done' ? (
        <Check size={12} aria-hidden="true" />
      ) : (
        <CircleAlert size={12} aria-hidden="true" />
      )}
      <span>
        {label}
        {tool.status === 'running' ? '…' : ''}
      </span>
      <span className="sr-only">{t(`assistant.toolStatus.${tool.status}`)}</span>
    </li>
  );
}

function Bubble({
  message,
  onConfirm,
  onDismiss,
  onSuggest,
}: {
  message: ChatMessage;
  onConfirm: (
    p: ChatMessage['proposals'][number]['proposal'],
    options?: { publishToPatient?: boolean },
  ) => void;
  onDismiss: (id: string) => void;
  onSuggest: (text: string) => void;
}) {
  const { t } = useTranslation();
  const mine = message.role === 'user';
  return (
    <li className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[92%] ${mine ? '' : 'w-full'}`}>
        <p className="sr-only">{mine ? t('assistant.you') : t('assistant.assistantSays')}</p>
        {message.tools.length > 0 && (
          <ul className="mb-1.5 flex flex-wrap gap-1.5" aria-label={t('assistant.activity')}>
            {message.tools.map((tool, i) => (
              <ToolChip key={`${tool.name}-${i}`} tool={tool} />
            ))}
          </ul>
        )}
        {(message.text || message.streaming) && (
          <div
            className={`rounded-lg px-3 py-2 text-sm leading-6 ${
              mine
                ? 'whitespace-pre-wrap break-words bg-primary text-white'
                : 'border border-border bg-surface text-text'
            }`}
          >
            {mine ? message.text : <MarkdownText text={message.text} />}
            {message.streaming && (
              <span
                aria-hidden="true"
                className="ms-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-current motion-safe:animate-pulse"
              />
            )}
            {message.streaming && !message.text && (
              <span className="sr-only">{t('assistant.thinking')}</span>
            )}
          </div>
        )}
        {message.proposals.map((p) => (
          <ProposalCard
            key={p.proposal.id}
            state={p}
            onConfirm={(options) => onConfirm(p.proposal, options)}
            onDismiss={() => onDismiss(p.proposal.id)}
            onSuggest={onSuggest}
          />
        ))}
      </div>
    </li>
  );
}

export function AssistantPanel({
  persona,
  client,
  context,
  blockedReason,
  consentHref = '/portal/profile',
  onChanged,
  className = '',
}: AssistantPanelProps) {
  const { t } = useTranslation();
  const chat = useAssistantChat({ client, persona, context, onChanged });
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState(false);
  const [templates, setTemplates] = useState(false);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const conversations = useConversations(client, history);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [announce, setAnnounce] = useState('');

  const unverified =
    blockedReason === 'VERIFICATION_REQUIRED' || chat.error?.kind === 'verification';
  const unavailable =
    (Boolean(blockedReason) &&
      blockedReason !== 'CONSENT_REQUIRED' &&
      blockedReason !== 'VERIFICATION_REQUIRED') ||
    chat.error?.kind === 'unavailable';
  const consent = blockedReason === 'CONSENT_REQUIRED' || chat.error?.kind === 'consent';

  // Keep the newest content in view as tokens arrive.
  useEffect(() => {
    const node = scroller.current;
    // Only a conversation follows its newest message; the template list starts at the top.
    if (node && chat.messages.length > 0) node.scrollTop = node.scrollHeight;
  }, [chat.messages]);

  // Announce each assistant message once, when it completes (not per token).
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (wasStreaming.current && !chat.streaming) {
      const last = [...chat.messages].reverse().find((m) => m.role === 'assistant');
      if (last?.text) setAnnounce(last.text);
    }
    wasStreaming.current = chat.streaming;
  }, [chat.streaming, chat.messages]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || chat.streaming) return;
    setDraft('');
    setHistory(false);
    void chat.send(text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const hasPatientContext = Boolean(context?.patientId);

  /** A complete template is sent; one with a [blank] goes to the composer, blank selected. */
  const pickTemplate = (prompt: string, needsInput: boolean) => {
    setTemplates(false);
    setHistory(false);
    if (!needsInput && !chat.streaming) {
      void chat.send(prompt);
      return;
    }
    pendingSelection.current = firstBlank(prompt) ?? { start: prompt.length, end: prompt.length };
    setDraft(prompt);
  };

  // Grow the composer with its content (up to the max height set in CSS).
  useEffect(() => {
    const node = input.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
    // After a template was picked: focus the composer and select its first [blank].
    const selection = pendingSelection.current;
    if (selection) {
      pendingSelection.current = null;
      node.focus();
      node.setSelectionRange(selection.start, selection.end);
    }
  }, [draft]);

  const startNew = () => {
    chat.reset();
    setHistory(false);
    setTemplates(false);
    input.current?.focus();
  };

  const errorKey = chat.error ? chat.error.kind : null;

  return (
    <div className={`flex h-full min-h-0 flex-col bg-bg ${className}`}>
      <div className="flex items-center justify-end gap-1 border-b border-border bg-surface px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={history}
          onClick={() => {
            setTemplates(false);
            setHistory((v) => !v);
          }}
          disabled={Boolean(unavailable)}
        >
          <History size={16} aria-hidden="true" />
          {t('assistant.history')}
        </Button>
        <Button variant="ghost" size="sm" onClick={startNew} disabled={Boolean(unavailable)}>
          <Plus size={16} aria-hidden="true" />
          {t('assistant.new')}
        </Button>
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>

      {templates ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-text">{t('assistant.templates.title')}</h3>
            <Button variant="ghost" size="sm" onClick={() => setTemplates(false)}>
              {t('assistant.templates.back')}
            </Button>
          </div>
          <PromptTemplates
            persona={persona}
            hasPatientContext={hasPatientContext}
            onPick={pickTemplate}
          />
        </div>
      ) : history ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <h3 className="mb-2 text-sm font-semibold text-text">{t('assistant.historyTitle')}</h3>
          {conversations.failed ? (
            <p role="alert" className="text-sm text-error">
              {t('assistant.historyError')}{' '}
              <button
                type="button"
                className="underline"
                onClick={() => void conversations.reload()}
              >
                {t('assistant.retry')}
              </button>
            </p>
          ) : conversations.items === null ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : conversations.items.length === 0 ? (
            <EmptyState title={t('assistant.historyEmpty')} />
          ) : (
            <ul className="space-y-2">
              {conversations.items.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-1 rounded-md border border-border bg-surface"
                >
                  <button
                    type="button"
                    className="min-h-11 min-w-0 flex-1 px-3 text-start text-sm text-text hover:bg-accent"
                    onClick={() => void chat.open(c.id).then((ok) => ok && setHistory(false))}
                  >
                    <span className="block truncate font-medium">
                      {c.title || t('assistant.untitled')}
                    </span>
                    <span className="block text-xs text-muted">
                      {new Date(c.updatedAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </button>
                  {confirmDelete === c.id ? (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        void conversations.remove(c.id).then(() => {
                          setConfirmDelete(null);
                          if (chat.conversationId === c.id) chat.reset();
                        });
                      }}
                    >
                      {t('assistant.deleteConfirm')}
                    </Button>
                  ) : (
                    <button
                      type="button"
                      className="grid size-11 place-items-center text-muted hover:text-error"
                      aria-label={t('assistant.delete')}
                      onClick={() => setConfirmDelete(c.id)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto p-3">
          {chat.messages.length === 0 && !unavailable && !consent && !unverified ? (
            <div className="py-2">
              <p className="text-sm font-medium text-text">{t(`assistant.greeting.${persona}`)}</p>
              <p className="mb-4 mt-1 text-sm text-muted">{t('assistant.templates.intro')}</p>
              <PromptTemplates
                persona={persona}
                hasPatientContext={hasPatientContext}
                onPick={pickTemplate}
              />
            </div>
          ) : (
            <ol className="space-y-3" aria-label={t('assistant.messages')}>
              {chat.messages.map((m) => (
                <Bubble
                  key={m.id}
                  message={m}
                  onConfirm={(p, options) => void chat.confirm(m.id, p, options)}
                  onDismiss={(id) => chat.dismiss(m.id, id)}
                  onSuggest={(text) => void chat.send(text)}
                />
              ))}
            </ol>
          )}
        </div>
      )}

      {unverified ? (
        <div role="alert" className="border-t border-border bg-surface p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-text">
            <AlertTriangle size={16} aria-hidden="true" />
            {t('assistant.error.verificationTitle')}
          </p>
          <p className="mt-1 text-muted">{t('assistant.error.verificationBody')}</p>
        </div>
      ) : unavailable ? (
        <div role="alert" className="border-t border-border bg-surface p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-text">
            <AlertTriangle size={16} aria-hidden="true" />
            {t('assistant.error.unavailableTitle')}
          </p>
          <p className="mt-1 text-muted">{t('assistant.error.unavailableBody')}</p>
        </div>
      ) : consent ? (
        <div role="alert" className="border-t border-border bg-surface p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-text">
            <AlertTriangle size={16} aria-hidden="true" />
            {t('assistant.error.consentTitle')}
          </p>
          <p className="mt-1 text-muted">{t('assistant.error.consentBody')}</p>
          <Link
            to={consentHref}
            className="mt-2 inline-flex min-h-10 items-center text-primary underline"
          >
            {t('assistant.error.consentLink')}
          </Link>
        </div>
      ) : (
        <>
          {errorKey && (
            <p
              role="alert"
              className="flex items-start gap-2 border-t border-border bg-error/10 px-3 py-2 text-sm text-error"
            >
              <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>{t(`assistant.error.${errorKey}`)}</span>
            </p>
          )}
          <form onSubmit={submit} className="border-t border-border bg-surface p-3">
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="ghost"
                aria-pressed={templates}
                aria-label={t('assistant.templates.open')}
                title={t('assistant.templates.open')}
                onClick={() => {
                  setHistory(false);
                  setTemplates((v) => !v);
                }}
                className="shrink-0 px-2.5"
              >
                <LayoutList size={18} aria-hidden="true" />
              </Button>
              <label className="min-w-0 flex-1">
                <span className="sr-only">{t('assistant.composer')}</span>
                <textarea
                  ref={input}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  aria-describedby="assistant-composer-hint"
                  maxLength={4000}
                  placeholder={t('assistant.placeholder')}
                  className="max-h-40 min-h-11 w-full resize-none overflow-y-auto rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder:text-muted"
                />
              </label>
              {chat.streaming ? (
                <Button type="button" variant="secondary" onClick={chat.stop}>
                  <Square size={14} aria-hidden="true" />
                  {t('assistant.stop')}
                </Button>
              ) : (
                <Button type="submit" disabled={!draft.trim()} aria-label={t('assistant.send')}>
                  <Send size={16} aria-hidden="true" className="rtl:-scale-x-100" />
                  <span className="hidden sm:inline">{t('assistant.send')}</span>
                </Button>
              )}
            </div>
            <p
              id="assistant-composer-hint"
              className="mt-1.5 hidden text-[11px] text-muted sm:block"
            >
              {t('assistant.templates.hint')}
            </p>
          </form>
        </>
      )}
      <p className="border-t border-border bg-surface px-3 py-2 text-xs text-muted">
        {t('assistant.disclaimer')}
      </p>
    </div>
  );
}
