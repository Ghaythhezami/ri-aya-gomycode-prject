import type { Response } from 'express';
import type { AssistantStreamEvent } from '@riaya/shared';

export type SseEmit = (event: AssistantStreamEvent) => void;

/**
 * Opens a Server-Sent Events response, flushes every event as it is written and aborts `run`
 * (and with it the Claude stream) when the client disconnects.
 */
export async function runSse(
  res: Response,
  run: (emit: SseEmit, signal: AbortSignal) => Promise<void>,
): Promise<void> {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  const emit: SseEmit = (event) => {
    if (res.writableEnded || controller.signal.aborted) return;
    res.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
    (res as Response & { flush?: () => void }).flush?.();
  };

  try {
    await run(emit, controller.signal);
  } finally {
    if (!res.writableEnded) res.end();
  }
}
