import { PdfBuilder, toWinAnsi } from './pdf-writer';

const info = {
  title: "RI'AYA analytics report",
  author: 'Mohamed Reda',
  creator: "RI'AYA",
  producer: "RI'AYA",
};

describe('pdf writer', () => {
  const pdf = new PdfBuilder(info);
  pdf.text(40, 800, 'Hello (world) \\ test', 12, true);
  pdf.rect(40, 700, 100, 20, [0.1, 0.5, 0.4]);
  pdf.addPage();
  pdf.text(40, 800, 'Page two');
  const buffer = pdf.build();
  const text = buffer.toString('latin1');

  it('starts with %PDF-1.4 and ends with %%EOF', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.endsWith('%%EOF')).toBe(true);
  });

  it('has correct xref offsets', () => {
    const startxref = Number(/startxref\n(\d+)\n%%EOF$/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const lines = text.slice(startxref).split('\n');
    const count = Number(lines[1]!.split(' ')[1]);
    for (let id = 1; id < count; id++) {
      const offset = Number(lines[2 + id]!.slice(0, 10));
      expect(text.slice(offset, offset + `${id} 0 obj`.length)).toBe(`${id} 0 obj`);
    }
  });

  it('carries the document info and two pages', () => {
    expect(text).toContain("/Title (RI'AYA analytics report)");
    expect(text).toContain('/Author (Mohamed Reda)');
    expect(text).toContain("/Creator (RI'AYA)");
    expect(text).toContain("/Producer (RI'AYA)");
    expect(text).toContain('/Count 2');
    expect(text).toContain('Hello \\(world\\) \\\\ test');
  });

  it('transliterates or drops non-WinAnsi characters', () => {
    expect(toWinAnsi('Café مرحبا — ok')).toBe('Café  - ok');
    expect(toWinAnsi('Łódź')).toContain('d');
  });
});
