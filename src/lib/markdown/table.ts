/** Keeps a value on one table row: pipes would split the cell and newlines end the row. */
export const markdownCell = (text: string) =>
  text
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ')
    .trim() || '—';

const markdownRow = (cells: string[]) => `| ${cells.map(markdownCell).join(' | ')} |`;

export const markdownTable = (header: string[], rows: string[][]) =>
  [markdownRow(header), `|${header.map(() => ' --- ').join('|')}|`, ...rows.map(markdownRow)].join('\n');

export const markdownCount = (value: number) => new Intl.NumberFormat('en-US').format(Math.round(value));
export const markdownSeconds = (milliseconds: number) => `${(milliseconds / 1_000).toFixed(1)} s`;
