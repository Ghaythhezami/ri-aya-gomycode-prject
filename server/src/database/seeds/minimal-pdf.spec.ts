import { buildMinimalPdf, PDF_LINES_PER_PAGE } from './minimal-pdf';

describe('buildMinimalPdf', () => {
  it('writes a well-formed PDF with xref offsets pointing at objects', () => {
    const bytes = buildMinimalPdf(['Hello (world)', 'Back\\slash', 'Café – test'], 'T');
    const text = bytes.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);

    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const entries = [...text.slice(startxref).matchAll(/^(\d{10}) \d{5} n $/gm)];
    expect(entries.length).toBeGreaterThanOrEqual(6);
    entries.forEach((entry, index) => {
      const offset = Number(entry[1]);
      expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    });
    expect(text).toContain('(Hello \\(world\\)) Tj');
    expect(text).toContain('(Back\\\\slash) Tj');
  });

  it('adds a page per block of lines and keeps /Length correct', () => {
    const lines = Array.from({ length: PDF_LINES_PER_PAGE * 2 + 1 }, (_, i) => `line ${i}`);
    const text = buildMinimalPdf(lines).toString('latin1');
    expect(text).toContain('/Count 3');
    for (const match of text.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) {
      expect(Buffer.byteLength(match[2]!, 'latin1')).toBe(Number(match[1]));
    }
  });
});
