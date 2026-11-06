/**
 * Minimal dependency-free PDF 1.4 writer (ANA-2): Helvetica (WinAnsi), several pages,
 * text lines and filled rectangles. Latin text only; other characters are transliterated
 * or dropped by `toWinAnsi`.
 */
export interface PdfInfo {
  title: string;
  author: string;
  creator: string;
  producer: string;
}

export interface PdfPage {
  ops: string[];
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

/** Replace characters outside WinAnsi (Latin-1 range plus a few) with safe equivalents. */
export function toWinAnsi(input: string): string {
  const replaced = input
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .normalize('NFC');
  let out = '';
  for (const ch of replaced) {
    const code = ch.codePointAt(0)!;
    if (code >= 32 && code <= 126) out += ch;
    else if (code >= 160 && code <= 255) out += ch;
    else if (code === 9 || code === 10) out += ' ';
    else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (base !== ch && /^[\x20-\x7e]+$/.test(base)) out += base;
      // anything else (Arabic, CJK, emoji) is omitted
    }
  }
  return out;
}

function escapeText(text: string): string {
  return toWinAnsi(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function pdfString(text: string): string {
  return `(${escapeText(text)})`;
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();

export class PdfBuilder {
  readonly pages: PdfPage[] = [];
  private current: PdfPage | null = null;

  constructor(private readonly info: PdfInfo) {
    this.addPage();
  }

  get width() {
    return PAGE_WIDTH;
  }
  get height() {
    return PAGE_HEIGHT;
  }

  addPage(): void {
    this.current = { ops: [] };
    this.pages.push(this.current);
  }

  /** Text with its baseline at (x, y); origin is bottom-left. */
  text(x: number, y: number, text: string, size = 10, bold = false): void {
    this.current!.ops.push(
      `BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(x)} ${num(y)} Td ${pdfString(text)} Tj ET`,
    );
  }

  /** Filled rectangle; colour components 0..1. */
  rect(x: number, y: number, w: number, h: number, rgb: [number, number, number]): void {
    this.current!.ops.push(
      `${num(rgb[0])} ${num(rgb[1])} ${num(rgb[2])} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f 0 0 0 rg`,
    );
  }

  build(): Buffer {
    // Object layout: 1 catalog, 2 pages, 3 F1, 4 F2, 5 info, then (page, content) pairs.
    const objects: string[] = [];
    const pageObjectIds = this.pages.map((_, i) => 6 + i * 2);
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${this.pages.length} >>`;
    objects[3] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    objects[5] =
      `<< /Title ${pdfString(this.info.title)} /Author ${pdfString(this.info.author)} ` +
      `/Creator ${pdfString(this.info.creator)} /Producer ${pdfString(this.info.producer)} >>`;
    this.pages.forEach((page, i) => {
      const pageId = 6 + i * 2;
      const contentId = pageId + 1;
      const stream = page.ops.join('\n');
      objects[pageId] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] =
        `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
    });

    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (let id = 1; id < objects.length; id++) {
      offsets[id] = Buffer.byteLength(out, 'latin1');
      out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xrefOffset = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id++) {
      out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(out, 'latin1');
  }
}
