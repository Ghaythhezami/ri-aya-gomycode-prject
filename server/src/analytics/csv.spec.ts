import { CSV_BOM, csvRow, escapeCsv } from './csv';

describe('csv escaping', () => {
  it('leaves plain values alone', () => {
    expect(escapeCsv('AP-1001')).toBe('AP-1001');
    expect(escapeCsv(30)).toBe('30');
    expect(escapeCsv(null)).toBe('');
  });
  it('quotes commas, quotes and newlines', () => {
    expect(escapeCsv('Smith, John')).toBe('"Smith, John"');
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsv('a\nb')).toBe('"a\nb"');
  });
  it('keeps Arabic text intact', () => {
    expect(escapeCsv('د. سارة أحمد')).toBe('د. سارة أحمد');
    expect(csvRow(['د. سارة, أحمد', 'x'])).toBe('"د. سارة, أحمد",x\r\n');
  });
  it('neutralises formula injection but keeps negative numbers', () => {
    expect(escapeCsv('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(escapeCsv('-5')).toBe('-5');
  });
  it('exposes the BOM', () => {
    expect(CSV_BOM).toBe('﻿');
  });
});
