/**
 * CSV helpers for admin exports opened in Excel.
 *
 * Every cell is quoted (commas, quotes and newlines stay inside their column)
 * and anything Excel would evaluate as a formula is prefixed with `'`.
 * Plain signed numbers and phone numbers (`+971 50 123 4567`, `-12.5`) are left
 * alone: Excel reads them as values, not formulas, and prefixing would corrupt them.
 */
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  const looksNumeric = /^[+-][\d\s().]*$/.test(text);
  if (/^[=@\t\r]/.test(text) || (/^[+-]/.test(text) && !looksNumeric)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Builds the CSV (UTF-8 BOM so Excel keeps Arabic/accents) and triggers a download. */
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
