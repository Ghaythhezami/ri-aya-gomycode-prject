import { AssistantHttpError, streamChat, type AssistantTransport } from './stream';
import type { AssistantStreamEvent } from '@riaya/shared';

function streamResponse(chunks: string[], status = 200): Response {
  const enc = new TextEncoder();
  let i = 0;
  return {
    ok: status < 400,
    status,
    statusText: '',
    json: async () => ({ code: 'AI_UNAVAILABLE', message: 'off' }),
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false, value: enc.encode(chunks[i++]) }
            : { done: true, value: undefined },
      }),
    },
  } as unknown as Response;
}

describe('streamChat', () => {
  it('delivers events across chunk boundaries', async () => {
    const events: AssistantStreamEvent[] = [];
    const t: AssistantTransport = {
      origin: '',
      getToken: () => 'a',
      fetchImpl: async () =>
        streamResponse(['event: text\ndata: {"del', 'ta":"x"}\n\nevent: nope\ndata: {}\n\n']),
    };
    await streamChat(t, '/x', {}, (e) => events.push(e));
    expect(events).toEqual([{ event: 'text', data: { delta: 'x' } }]);
  });

  it('refreshes the token once on 401 and retries', async () => {
    const calls: (string | undefined)[] = [];
    const t: AssistantTransport = {
      origin: '',
      getToken: () => 'old',
      refresh: async () => 'new',
      fetchImpl: async (_u, init) => {
        const auth = (init?.headers as Record<string, string>).Authorization;
        calls.push(auth);
        return auth === 'Bearer new' ? streamResponse([]) : streamResponse([], 401);
      },
    };
    await streamChat(t, '/x', {}, () => undefined);
    expect(calls).toEqual(['Bearer old', 'Bearer new']);
  });

  it('rejects with the server error code', async () => {
    const t: AssistantTransport = {
      origin: '',
      getToken: () => null,
      fetchImpl: async () => streamResponse([], 503),
    };
    await expect(streamChat(t, '/x', {}, () => undefined)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
      status: 503,
    });
    await expect(streamChat(t, '/x', {}, () => undefined)).rejects.toBeInstanceOf(
      AssistantHttpError,
    );
  });
});
