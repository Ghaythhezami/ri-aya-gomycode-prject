export type RichBlock =
  { type: 'p'; text: string } | { type: 'ul'; items: string[] } | { type: 'ol'; items: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;

/**
 * Markdown-ish parsing limited to paragraphs and lists. It returns plain strings, which React
 * escapes on render, so clinician-written text can never inject HTML.
 */
export function parseRichText(input: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') });
    paragraph = [];
  };
  for (const raw of input.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const bullet = BULLET.exec(raw);
    const number = NUMBER.exec(raw);
    if (!line) {
      flush();
    } else if (bullet || number) {
      flush();
      const type = bullet ? 'ul' : 'ol';
      const text = (bullet ?? number)![1]!.trim();
      const last = blocks[blocks.length - 1];
      if (last && last.type === type) last.items.push(text);
      else blocks.push({ type, items: [text] });
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}
