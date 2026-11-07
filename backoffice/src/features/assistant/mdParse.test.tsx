import { render } from '@testing-library/react';
import { MarkdownText } from './MarkdownText';
import { parseMarkdown } from './mdParse';

describe('parseMarkdown', () => {
  it('splits paragraphs and keeps single newlines as lines', () => {
    const blocks = parseMarkdown('one\ntwo\n\nthree');
    expect(blocks).toHaveLength(2);
    expect((blocks[0] as { lines: unknown[] }).lines).toHaveLength(2);
  });

  it('groups list items and distinguishes ordered lists', () => {
    const blocks = parseMarkdown('- a\n- b\n\n1. x\n2. y');
    expect(blocks.map((b) => b.type)).toEqual(['ul', 'ol']);
    expect((blocks[0] as { items: unknown[] }).items).toHaveLength(2);
  });

  it('parses bold and inline code, leaving unterminated markers literal', () => {
    const [p] = parseMarkdown('**Hi** `x` **open');
    const types = (p as { lines: { type: string }[][] }).lines[0]!.map((n) => n.type);
    expect(types).toEqual(['bold', 'text', 'code', 'text']);
  });
});

describe('Markdown', () => {
  it('renders HTML in the source as literal text', () => {
    const { container } = render(
      <MarkdownText text={'<script>alert(1)</script> <img src=x onerror=alert(1)> **ok**'} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.querySelector('strong')?.textContent).toBe('ok');
  });

  it('renders lists and code', () => {
    const { container } = render(<MarkdownText text={'- one\n- `two`'} />);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('code')?.textContent).toBe('two');
  });
});
