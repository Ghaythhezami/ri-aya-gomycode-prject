import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AlternativeSlot,
  AssistantChatInput,
  AssistantConversationSummary,
  AssistantPersona,
  AssistantProposal,
  AssistantStreamEvent,
} from '@riaya/shared';
import type { AssistantClient } from './client';
import { classifyError, type AssistantErrorKind } from './launcherState';
import { appendClinicalNote, proposalOutcome, proposalToRest } from './proposals';
import { AssistantHttpError, requestJson, streamChat } from './stream';

export interface ProposalState {
  proposal: AssistantProposal;
  status: 'pending' | 'running' | 'done' | 'dismissed' | 'conflict' | 'error';
  message?: string;
  alternatives?: AlternativeSlot[];
}

export interface ToolActivity {
  name: string;
  status: 'running' | 'done' | 'error';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools: ToolActivity[];
  proposals: ProposalState[];
  streaming: boolean;
}

export interface ChatError {
  kind: AssistantErrorKind;
  message: string;
}

let counter = 0;
const nextId = () => `m${Date.now().toString(36)}${counter++}`;

/** Tolerant reader for a stored conversation: `messages[].text|content` (string or text blocks). */
export function normalizeConversation(raw: unknown): ChatMessage[] {
  const list = (raw as { messages?: unknown[] } | null)?.messages;
  if (!Array.isArray(list)) return [];
  const out: ChatMessage[] = [];
  for (const item of list) {
    const m = item as { id?: string; role?: string; text?: unknown; content?: unknown };
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const source = m.text ?? m.content;
    const text =
      typeof source === 'string'
        ? source
        : Array.isArray(source)
          ? source
              .map((b) => (b as { type?: string; text?: string }).text ?? '')
              .filter(Boolean)
              .join('')
          : '';
    if (!text) continue;
    out.push({
      id: m.id ?? nextId(),
      role: m.role,
      text,
      tools: [],
      proposals: [],
      streaming: false,
    });
  }
  return out;
}

interface Options {
  client: AssistantClient;
  persona: AssistantPersona;
  context?: AssistantChatInput['context'];
  /** Called after a confirmed proposal changed data (cache invalidation, refetch). */
  onChanged?: () => void;
}

export function useAssistantChat({ client, persona, context, onChanged }: Options) {
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const contextRef = useRef(context);
  contextRef.current = context;
  const idRef = useRef(conversationId);
  idRef.current = conversationId;

  useEffect(() => () => abortRef.current?.abort(), []);

  const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((list) => {
      const last = list[list.length - 1];
      return last ? [...list.slice(0, -1), fn(last)] : list;
    });

  const handleEvent = (event: AssistantStreamEvent) => {
    switch (event.event) {
      case 'conversation':
        setConversationId(event.data.conversationId);
        break;
      case 'text':
        patchLast((m) => ({ ...m, text: m.text + event.data.delta }));
        break;
      case 'tool':
        patchLast((m) => {
          const tools = m.tools.filter(
            (x) => !(x.name === event.data.name && x.status === 'running'),
          );
          return { ...m, tools: [...tools, { name: event.data.name, status: event.data.status }] };
        });
        break;
      case 'proposal':
        patchLast((m) => ({
          ...m,
          proposals: [...m.proposals, { proposal: event.data, status: 'pending' }],
        }));
        break;
      case 'error':
        setError({ kind: classifyError(event.data.code), message: event.data.message });
        break;
      default:
        break;
    }
  };

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || abortRef.current) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      setStreaming(true);
      setMessages((list) => [
        ...list,
        { id: nextId(), role: 'user', text: message, tools: [], proposals: [], streaming: false },
        { id: nextId(), role: 'assistant', text: '', tools: [], proposals: [], streaming: true },
      ]);
      const body: AssistantChatInput = {
        message,
        ...(idRef.current ? { conversationId: idRef.current } : {}),
        ...(contextRef.current && persona !== 'patient' ? { context: contextRef.current } : {}),
      };
      try {
        await streamChat(
          client.transport,
          `${client.base}/chat`,
          body,
          handleEvent,
          controller.signal,
          i18n.language,
        );
      } catch (cause) {
        if ((cause as { name?: string }).name !== 'AbortError') {
          const e = cause as AssistantHttpError;
          setError({ kind: classifyError(e.code ?? '', e.status ?? 0), message: e.message });
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        setMessages((list) =>
          list
            // drop an empty assistant bubble left by a failed/aborted request
            .filter(
              (m, i) => !(i === list.length - 1 && m.streaming && !m.text && !m.proposals.length),
            )
            .map((m) => ({
              ...m,
              streaming: false,
              tools: m.tools.map((x) => (x.status === 'running' ? { ...x, status: 'done' } : x)),
            })),
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, persona, i18n.language],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(undefined);
    setError(null);
  }, []);

  const open = useCallback(
    async (id: string) => {
      abortRef.current?.abort();
      setError(null);
      try {
        const raw = await requestJson<unknown>(
          client.transport,
          'GET',
          `${client.base}/conversations/${id}`,
          undefined,
          i18n.language,
        );
        setMessages(normalizeConversation(raw));
        setConversationId(id);
        return true;
      } catch (cause) {
        const e = cause as AssistantHttpError;
        setError({ kind: classifyError(e.code ?? '', e.status ?? 0), message: e.message });
        return false;
      }
    },
    [client, i18n.language],
  );

  const setProposal = (messageId: string, proposalId: string, patch: Partial<ProposalState>) =>
    setMessages((list) =>
      list.map((m) =>
        m.id === messageId
          ? {
              ...m,
              proposals: m.proposals.map((p) =>
                p.proposal.id === proposalId ? { ...p, ...patch } : p,
              ),
            }
          : m,
      ),
    );

  const confirm = useCallback(
    async (
      messageId: string,
      proposal: AssistantProposal,
      options?: { publishToPatient?: boolean },
    ) => {
      setProposal(messageId, proposal.id, { status: 'running', message: undefined });
      try {
        const call = proposalToRest(proposal, {
          audience: persona === 'patient' ? 'patient' : 'staff',
          contextPatientId: contextRef.current?.patientId,
          defaultReason: t('assistant.defaultCancelReason'),
          publishToPatient: options?.publishToPatient,
        });
        let body = call.body;
        if (call.appendNote) {
          const patient = await requestJson<{ clinicalNotes?: string | null }>(
            client.transport,
            'GET',
            `/api/patients/${call.appendNote.patientId}`,
          );
          body = {
            clinicalNotes: appendClinicalNote(patient.clinicalNotes, call.appendNote.note),
          };
        }
        // Tags bookings confirmed from an assistant proposal (`source = ASSISTANT`).
        await requestJson(client.transport, call.method, call.url, body, i18n.language, {
          'X-Riaya-Source': 'assistant',
        });
        setProposal(messageId, proposal.id, { status: 'done' });
        onChanged?.();
      } catch (cause) {
        if (cause instanceof Error && cause.message === 'PATIENT_REQUIRED') {
          setProposal(messageId, proposal.id, {
            status: 'error',
            message: t('assistant.proposal.patientRequired'),
          });
          return;
        }
        const e = cause as AssistantHttpError;
        const outcome = proposalOutcome(e.status ?? 0, e.code ?? '');
        const details = e.details as { alternatives?: AlternativeSlot[] } | undefined;
        setProposal(messageId, proposal.id, {
          status: outcome.kind === 'conflict' ? 'conflict' : 'error',
          message: e.message,
          alternatives: details?.alternatives,
        });
      }
    },
    [client, persona, onChanged, i18n.language, t],
  );

  const dismiss = useCallback(
    (messageId: string, proposalId: string) =>
      setProposal(messageId, proposalId, { status: 'dismissed' }),
    [],
  );

  return {
    messages,
    conversationId,
    streaming,
    error,
    clearError: () => setError(null),
    send,
    stop,
    reset,
    open,
    confirm,
    dismiss,
  };
}

/** Conversation history for the drawer. */
export function useConversations(client: AssistantClient, enabled: boolean) {
  const [items, setItems] = useState<AssistantConversationSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const raw = await requestJson<
        AssistantConversationSummary[] | { items?: AssistantConversationSummary[] }
      >(client.transport, 'GET', `${client.base}/conversations`);
      setItems(Array.isArray(raw) ? raw : (raw?.items ?? []));
    } catch {
      setFailed(true);
    }
  }, [client]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const remove = useCallback(
    async (id: string) => {
      try {
        await requestJson(client.transport, 'DELETE', `${client.base}/conversations/${id}`);
        setItems((list) => list?.filter((c) => c.id !== id) ?? list);
        return true;
      } catch {
        return false;
      }
    },
    [client],
  );

  return { items, failed, reload: load, remove };
}
