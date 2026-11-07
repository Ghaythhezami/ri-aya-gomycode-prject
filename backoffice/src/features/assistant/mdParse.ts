/** Tiny, safe markdown subset: paragraphs, **bold**, `code`, bullet and numbered lists. */
export type Inline =
  { type: 'text'; text: string } | { type: 'bold'; text: string } | { type: 'code'; text: string };

export type Block = { type: 'p'; lines: Inline[][] } | { type: 'ul' | 'ol'; items: Inline[][] };

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  for (const part of source.split(INLINE)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      out.push({ type: 'bold', text: part.slice(2, -2) });
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      out.push({ type: 'code', text: part.slice(1, -1) });
    } else {
      out.push({ type: 'text', text: part });
    }
  }
  return out;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  // `open` is true while the last block is a paragraph that a plain line may extend.
  let open = false;
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const bullet = BULLET.exec(raw);
    const numbered = bullet ? null : NUMBERED.exec(raw);
    const last = blocks[blocks.length - 1];
    if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      const item = parseInline((bullet ?? numbered)![1]!);
      if (last?.type === type) last.items.push(item);
      else blocks.push({ type, items: [item] });
      open = false;
    } else if (raw.trim() === '') {
      open = false;
    } else if (open && last?.type === 'p') {
      last.lines.push(parseInline(raw.trim()));
    } else {
      blocks.push({ type: 'p', lines: [parseInline(raw.trim())] });
      open = true;
    }
  }
  return blocks;
}
