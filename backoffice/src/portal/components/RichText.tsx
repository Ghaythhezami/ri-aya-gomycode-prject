import { useMemo } from 'react';
import { parseRichText } from '../lib/richText';

/** Paragraphs and lists only. Text is rendered as React text nodes, so HTML is escaped. */
export function RichText({ text }: { text: string }) {
  const blocks = useMemo(() => parseRichText(text), [text]);
  return (
    <div className="space-y-3 text-sm leading-6 text-text">
      {blocks.map((block, i) => {
        if (block.type === 'p') return <p key={i}>{block.text}</p>;
        const Tag = block.type === 'ul' ? 'ul' : 'ol';
        return (
          <Tag
            key={i}
            className={`ms-5 space-y-1 ${block.type === 'ul' ? 'list-disc' : 'list-decimal'}`}
          >
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </Tag>
        );
      })}
    </div>
  );
}
