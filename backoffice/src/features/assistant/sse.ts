import type { AssistantStreamEvent } from '@riaya/shared';

/** One raw Server-Sent Event: the `event:` name and the joined `data:` lines. */
export interface SseMessage {
  event: string;
  data: string;
}

export interface SseParser {
  /** Feed a decoded chunk; returns every event completed by it. */
  push(chunk: string): SseMessage[];
  /** End of stream: lenient flush of a final event that lacks its blank line. */
  flush(): SseMessage[];
}

/**
 * Incremental SSE parser. Chunks may split anywhere (mid-line, mid-CRLF, between
 * `event:` and `data:`); events are emitted on the blank line that ends them.
 * Comment lines (`:`) and unknown fields are ignored.
 */
export function createSseParser(): SseParser {
  let held = ''; // a trailing "\r" that may be the first half of "\r\n"
  let buffer = '';
  let event = '';
  let data: string[] = [];
  let hasData = false;

  const dispatch = (out: SseMessage[]) => {
    if (hasData) out.push({ event: event || 'message', data: data.join('\n') });
    event = '';
    data = [];
    hasData = false;
  };

  const line = (text: string, out: SseMessage[]) => {
    if (text === '') {
      dispatch(out);
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') {
      data.push(value);
      hasData = true;
    }
  };

  return {
    push(chunk) {
      const out: SseMessage[] = [];
      let text = held + chunk;
      held = '';
      if (text.endsWith('\r')) {
        held = '\r';
        text = text.slice(0, -1);
      }
      buffer += text.replace(/\r\n?/g, '\n');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const l of lines) line(l, out);
      return out;
    },
    flush() {
      const out: SseMessage[] = [];
      held = '';
      if (buffer) line(buffer, out);
      buffer = '';
      dispatch(out);
      return out;
    },
  };
}

const KNOWN = new Set(['conversation', 'text', 'tool', 'proposal', 'done', 'error']);

/** Turn a raw message into a typed assistant event; unknown names and bad JSON give `null`. */
export function toAssistantEvent(message: SseMessage): AssistantStreamEvent | null {
  if (!KNOWN.has(message.event)) return null;
  try {
    const data: unknown = JSON.parse(message.data);
    if (data === null || typeof data !== 'object') return null;
    return { event: message.event, data } as AssistantStreamEvent;
  } catch {
    return null;
  }
}
