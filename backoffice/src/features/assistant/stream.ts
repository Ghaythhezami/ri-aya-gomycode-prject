import type { AssistantStreamEvent } from '@riaya/shared';
import { createSseParser, toAssistantEvent } from './sse';

/** Failure of an HTTP call made by the assistant (stream or confirmed proposal). */
export class AssistantHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AssistantHttpError';
  }
}

export interface AssistantTransport {
  /** Origin prefix (empty for same-origin). */
  origin: string;
  getToken: () => string | null;
  /** Refresh the session once after a 401; resolves the new access token. */
  refresh?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

async function toHttpError(res: Response): Promise<AssistantHttpError> {
  let code = res.status === 0 ? 'NETWORK_ERROR' : 'INTERNAL_ERROR';
  let message = res.statusText;
  let details: unknown;
  try {
    const body = (await res.json()) as { code?: string; message?: string; details?: unknown };
    code = body.code ?? code;
    message = body.message ?? message;
    details = body.details;
  } catch {
    /* non-JSON body */
  }
  return new AssistantHttpError(res.status, code, message, details);
}

/** Fetch with bearer token; one token refresh and retry on 401. */
export async function authorizedFetch(
  transport: AssistantTransport,
  path: string,
  init: RequestInit & { headers?: Record<string, string> },
): Promise<Response> {
  const doFetch = fetch_(transport);
  const send = (token: string | null) =>
    doFetch(`${transport.origin}${path}`, {
      credentials: 'include',
      ...init,
      headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });

  let res: Response;
  try {
    res = await send(transport.getToken());
    if (res.status === 401 && transport.refresh) {
      const token = await transport.refresh().catch(() => null);
      if (token) res = await send(token);
    }
  } catch (cause) {
    if ((cause as { name?: string }).name === 'AbortError') throw cause;
    throw new AssistantHttpError(0, 'NETWORK_ERROR', 'Network error');
  }
  return res;
}

function fetch_(t: AssistantTransport): typeof fetch {
  return t.fetchImpl ?? ((...args) => fetch(...args));
}

/** JSON request helper used for proposals, conversations and status. */
export async function requestJson<T>(
  transport: AssistantTransport,
  method: string,
  path: string,
  body?: unknown,
  lang?: string,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const res = await authorizedFetch(transport, path, {
    method,
    headers: {
      ...extraHeaders,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(lang ? { 'Accept-Language': lang } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await toHttpError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** POST a chat message and deliver each SSE event as it arrives. Rejects with AssistantHttpError. */
export async function streamChat(
  transport: AssistantTransport,
  path: string,
  body: unknown,
  onEvent: (event: AssistantStreamEvent) => void,
  signal?: AbortSignal,
  lang?: string,
): Promise<void> {
  const res = await authorizedFetch(transport, path, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      ...(lang ? { 'Accept-Language': lang } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw await toHttpError(res);
  if (!res.body) throw new AssistantHttpError(res.status, 'NETWORK_ERROR', 'Empty stream');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  const emit = (messages: ReturnType<typeof parser.push>) => {
    for (const m of messages) {
      const event = toAssistantEvent(m);
      if (event) onEvent(event);
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      emit(parser.push(decoder.decode(value, { stream: true })));
    }
    emit(parser.push(decoder.decode()));
    emit(parser.flush());
  } catch (cause) {
    if ((cause as { name?: string }).name === 'AbortError') throw cause;
    throw new AssistantHttpError(0, 'NETWORK_ERROR', 'Stream interrupted');
  }
}
