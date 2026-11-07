import { Fragment } from 'react';
import { parseMarkdown, type Inline } from './mdParse';

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) =>
        n.type === 'bold' ? (
          <strong key={i}>{n.text}</strong>
        ) : n.type === 'code' ? (
          <code key={i} className="rounded-sm bg-bg px-1 py-0.5 font-mono text-[0.85em]" dir="ltr">
            {n.text}
          </code>
        ) : (
          <Fragment key={i}>{n.text}</Fragment>
        ),
      )}
    </>
  );
}

/** Renders the markdown subset as React text nodes only: HTML in the source is shown literally. */
export function MarkdownText({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="space-y-2 break-words">
      {blocks.map((b, i) => {
        if (b.type === 'p') {
          return (
            <p key={i}>
              {b.lines.map((line, j) => (
                <Fragment key={j}>
                  {j > 0 ? <br /> : null}
                  <Inlines nodes={line} />
                </Fragment>
              ))}
            </p>
          );
        }
        const List = b.type === 'ul' ? 'ul' : 'ol';
        return (
          <List
            key={i}
            className={`ms-5 space-y-1 ${b.type === 'ul' ? 'list-disc' : 'list-decimal'}`}
          >
            {b.items.map((item, j) => (
              <li key={j}>
                <Inlines nodes={item} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
