import { createSseParser, toAssistantEvent } from './sse';

describe('createSseParser', () => {
  it('parses several events from one chunk', () => {
    const p = createSseParser();
    const out = p.push(
      'event: text\ndata: {"delta":"Hi"}\n\nevent: done\ndata: {"stopReason":"end_turn"}\n\n',
    );
    expect(out).toEqual([
      { event: 'text', data: '{"delta":"Hi"}' },
      { event: 'done', data: '{"stopReason":"end_turn"}' },
    ]);
  });

  it('reassembles an event split mid-line across chunks', () => {
    const p = createSseParser();
    expect(p.push('event: te')).toEqual([]);
    expect(p.push('xt\ndata: {"delta":"he')).toEqual([]);
    expect(p.push('llo"}\n')).toEqual([]);
    expect(p.push('\n')).toEqual([{ event: 'text', data: '{"delta":"hello"}' }]);
  });

  it('handles CRLF, including a CR/LF pair split between chunks', () => {
    const p = createSseParser();
    expect(p.push('event: text\r')).toEqual([]);
    expect(p.push('\ndata: {"delta":"a"}\r\n\r')).toEqual([]);
    expect(p.push('\n')).toEqual([{ event: 'text', data: '{"delta":"a"}' }]);
  });

  it('joins multi-line data and ignores comments and unknown fields', () => {
    const p = createSseParser();
    const out = p.push(': keep-alive\nid: 7\nretry: 100\nevent: text\ndata: a\ndata: b\n\n');
    expect(out).toEqual([{ event: 'text', data: 'a\nb' }]);
  });

  it('defaults the event name to message and skips empty events', () => {
    const p = createSseParser();
    expect(p.push('\n\ndata: x\n\n')).toEqual([{ event: 'message', data: 'x' }]);
  });

  it('flushes a final event without its blank line', () => {
    const p = createSseParser();
    expect(p.push('event: done\ndata: {}')).toEqual([]);
    expect(p.flush()).toEqual([{ event: 'done', data: '{}' }]);
  });
});

describe('toAssistantEvent', () => {
  it('types known events', () => {
    expect(toAssistantEvent({ event: 'text', data: '{"delta":"x"}' })).toEqual({
      event: 'text',
      data: { delta: 'x' },
    });
  });

  it('ignores unknown events and malformed JSON', () => {
    expect(toAssistantEvent({ event: 'ping', data: '{}' })).toBeNull();
    expect(toAssistantEvent({ event: 'text', data: '{oops' })).toBeNull();
    expect(toAssistantEvent({ event: 'text', data: '"str"' })).toBeNull();
  });
});
