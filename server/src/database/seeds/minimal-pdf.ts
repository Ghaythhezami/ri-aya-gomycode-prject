/**
 * Minimal text-only PDF 1.4 writer for the demo seed (no dependency).
 * Helvetica, A4, one content stream per page, correct xref byte offsets.
 * Input is reduced to printable WinAnsi-safe ASCII.
 */

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 50;
const TOP_Y = 800;
const FONT_SIZE = 10;
const LEADING = 14;
const LINES_PER_PAGE = 52;

/** Replace anything outside printable ASCII so the byte stream stays valid. */
export function toAscii(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, '?');
}

function escapePdfText(line: string): string {
  return toAscii(line).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function pageStream(lines: string[]): string {
  const parts = ['BT', `/F1 ${FONT_SIZE} Tf`, `${LEADING} TL`, `${MARGIN_X} ${TOP_Y} Td`];
  for (const line of lines) parts.push(`(${escapePdfText(line)}) Tj T*`);
  parts.push('ET');
  return parts.join('\n');
}

/** Build a valid PDF whose pages carry the given text lines (50 lines per page). */
export function buildMinimalPdf(lines: string[], title = 'Clinical document'): Buffer {
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    chunks.push(lines.slice(i, i + LINES_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push(['']);

  // Object numbers: 1 catalog, 2 pages, 3 font, 4 info, then page/content pairs.
  const pageObjNumbers = chunks.map((_, index) => 5 + index * 2);
  const bodies = new Map<number, string>();
  bodies.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  bodies.set(
    2,
    `<< /Type /Pages /Kids [${pageObjNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${chunks.length} >>`,
  );
  bodies.set(
    3,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  bodies.set(4, `<< /Title (${escapePdfText(title)}) /Author (Demo seed) >>`);
  chunks.forEach((chunk, index) => {
    const pageNo = 5 + index * 2;
    const stream = pageStream(chunk);
    bodies.set(
      pageNo,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageNo + 1} 0 R >>`,
    );
    bodies.set(
      pageNo + 1,
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    );
  });

  const total = 4 + chunks.length * 2;
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let n = 1; n <= total; n += 1) {
    offsets[n] = Buffer.byteLength(out, 'latin1');
    out += `${n} 0 obj\n${bodies.get(n)!}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= total; n += 1) {
    out += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

export const PDF_LINES_PER_PAGE = LINES_PER_PAGE;
