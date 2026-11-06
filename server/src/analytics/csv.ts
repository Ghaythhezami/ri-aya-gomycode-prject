/** CSV helpers (RFC 4180 quoting, UTF-8 BOM first for Excel with Arabic text). */
export const CSV_BOM = '﻿';

export function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Neutralise spreadsheet formula injection from user-entered text.
  if (/^[=+@]/.test(text) || (/^-/.test(text) && Number.isNaN(Number(text)))) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(values: (string | number | null | undefined)[]): string {
  return `${values.map(escapeCsv).join(',')}\r\n`;
}
