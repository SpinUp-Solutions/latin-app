import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFPage, rgb, type RGB } from 'pdf-lib';
import type {
  TestResultPdfExercise,
  TestResultPdfLineGroup,
  TestResultPdfModel,
} from '@/src/lib/tests/result-pdf-model';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 48;
const MARGIN_TOP = 44;
const MARGIN_BOTTOM = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const BODY_SIZE = 10;
const LEADING = 15;
const LABEL_SIZE = 7.5;
const ROMAN_RED = rgb(139 / 255, 38 / 255, 53 / 255);
const PARCHMENT = rgb(248 / 255, 243 / 255, 230 / 255);
const INK = rgb(0.15, 0.18, 0.23);
const MUTED = rgb(0.39, 0.43, 0.48);
const RULE = rgb(0.86, 0.86, 0.85);
const WHITE = rgb(1, 1, 1);
const STATUS = {
  Correct: { ink: rgb(0.02, 0.37, 0.27), fill: rgb(0.94, 0.98, 0.96) },
  'Partly correct': { ink: rgb(0.57, 0.25, 0.05), fill: rgb(1, 0.98, 0.92) },
  Incorrect: { ink: rgb(0.62, 0.07, 0.22), fill: rgb(1, 0.95, 0.96) },
};

const fontBytesCache = new Map<string, Uint8Array>();

async function loadFontBytes(fileName: string): Promise<Uint8Array> {
  const cached = fontBytesCache.get(fileName);
  if (cached) return cached;

  const candidates = [
    path.join(process.cwd(), 'src/lib/tests/fonts', fileName),
    (() => {
      try {
        const resolved = fileURLToPath(new URL(`./fonts/${fileName}`, import.meta.url));
        return typeof resolved === 'string' && resolved.endsWith(fileName) ? resolved : null;
      } catch {
        return null;
      }
    })(),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      const bytes = new Uint8Array(await readFile(candidate));
      if (bytes.byteLength > 100) {
        fontBytesCache.set(fileName, bytes);
        return bytes;
      }
    } catch {
      continue;
    }
  }
  throw new Error(`Unicode PDF font is missing (${fileName})`);
}

const wrapLine = (font: PDFFont, text: string, size: number, maxWidth: number): string[] => {
  const normalized = text.replace(/[ \t]+/g, ' ').trimEnd();
  if (!normalized) return [''];
  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = '';
    for (const character of word) {
      const candidate = chunk + character;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) chunk = candidate;
      else {
        if (chunk) lines.push(chunk);
        chunk = character;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines;
};

const wrapParagraphs = (font: PDFFont, text: string, size: number, maxWidth: number): string[] =>
  text.split(/\r?\n/).flatMap(paragraph => wrapLine(font, paragraph, size, maxWidth));

interface Column {
  label?: string;
  lines: string[];
  color?: RGB;
  fill?: RGB;
}

interface Block {
  columns: Column[];
  size?: number;
  serif?: boolean;
  inset?: number;
  gap?: number;
  grid?: boolean;
  headerRow?: boolean;
  maxWidth?: number;
}

const isStudent = (group: TestResultPdfLineGroup) => group.heading?.startsWith('Student') || group.tone === 'student';
const isExpected = (group: TestResultPdfLineGroup) => group.heading?.startsWith('Expected') || group.tone === 'answer';
const isScore = (group: TestResultPdfLineGroup) =>
  ['score', 'correct', 'partial', 'incorrect'].includes(group.tone ?? '');
const answerStyle = (group: TestResultPdfLineGroup) =>
  group.tone === 'student' || group.tone === 'correct'
    ? STATUS.Correct
    : group.tone === 'partial'
      ? STATUS['Partly correct']
      : group.tone === 'incorrect'
        ? STATUS.Incorrect
        : { ink: MUTED, fill: WHITE };

/** Presentation only: never infer scores or answers from the displayed text. */
function exerciseBlocks(exercise: TestResultPdfExercise): Block[] {
  const blocks: Block[] = [];
  for (let index = 0; index < exercise.groups.length; index += 1) {
    const group = exercise.groups[index];
    const next = exercise.groups[index + 1];
    if (group.table) {
      const { columns, rows } = group.table;
      // Keep wide paradigms readable: repeat the first column in each band.
      const bands: number[][] = [];
      if (columns.length <= 4) bands.push(columns.map((_, index) => index));
      else
        for (let start = 1; start < columns.length; start += 3) {
          bands.push([0, ...columns.slice(start, start + 3).map((_, index) => start + index)]);
        }
      for (const band of bands) {
        if (!band.length) continue;
        const labeled = (row?: (typeof rows)[number]) =>
          band.map(index => {
            const cell = row?.[index];
            return {
              label: columns[index],
              lines: cell?.lines ?? [],
              ...(cell
                ? {
                    color: answerStyle({ lines: [], tone: cell.tone }).ink,
                    fill: answerStyle({ lines: [], tone: cell.tone }).fill,
                  }
                : {}),
            };
          });
        blocks.push({
          columns: labeled(),
          grid: true,
          headerRow: true,
          size: 9,
          inset: 6,
          gap: 0,
        });
        rows.forEach((row, rowIndex) => {
          blocks.push({
            columns: labeled(row),
            grid: true,
            size: 9,
            inset: 8,
            gap: rowIndex === rows.length - 1 ? 12 : 0,
          });
        });
      }
    } else if (isExpected(group) && next && isStudent(next)) {
      blocks.push({
        columns: [
          { label: group.heading, lines: group.lines, color: STATUS.Correct.ink },
          { label: next.heading, lines: next.lines, color: answerStyle(next).ink, fill: answerStyle(next).fill },
        ],
        inset: 10,
        gap: 12,
      });
      index += 1;
    } else if (isStudent(group)) {
      blocks.push({
        columns: [
          { label: group.heading, lines: group.lines, color: answerStyle(group).ink, fill: answerStyle(group).fill },
        ],
        inset: 10,
        gap: 12,
      });
    } else if (isExpected(group)) {
      blocks.push({
        columns: [{ label: group.heading, lines: group.lines, color: STATUS.Correct.ink }],
        inset: 10,
        gap: 12,
      });
    } else if (isScore(group)) {
      // A numbered part's prompt and mark share a compact line. A neutral
      // ungraded part stays neutral rather than acquiring an incorrect badge.
      blocks.push({
        columns: [{ lines: [[group.heading, ...group.lines].filter(Boolean).join(' · ')], color: MUTED }],
        size: 8,
        gap: 4,
      });
    } else if (group.heading === 'AI score') {
      blocks.push({ columns: [{ lines: [`AI score: ${group.lines.join(' · ')}`], color: MUTED }], size: 8, gap: 6 });
    } else {
      const question = group.heading === 'Question' || group.heading?.startsWith('Question ');
      blocks.push({
        columns: [{ label: question ? undefined : group.heading, lines: group.lines }],
        serif: question,
        size: question ? 11.5 : BODY_SIZE,
        gap: 8,
      });
    }
  }
  return blocks;
}

class PdfWriter {
  private page!: PDFPage;
  private y = 0;
  private activeExercise?: TestResultPdfExercise;
  readonly pages: PDFPage[] = [];

  constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
    private readonly serif: PDFFont
  ) {
    this.addPage();
  }

  private addPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    this.y = PAGE_HEIGHT - MARGIN_TOP;
    if (this.activeExercise) this.exerciseHeader(this.activeExercise, true);
  }

  private remaining() {
    return this.y - MARGIN_BOTTOM;
  }

  private draw(text: string, x: number, top: number, size = BODY_SIZE, font = this.regular, color = INK) {
    if (text) this.page.drawText(text, { x, y: top - size, size, font, color });
  }

  private rule(y: number, color = RULE) {
    this.page.drawLine({ start: { x: MARGIN_X, y }, end: { x: PAGE_WIDTH - MARGIN_X, y }, thickness: 0.6, color });
  }

  private lines(text: string, font: PDFFont, size: number, width: number) {
    return wrapParagraphs(font, text, size, width);
  }

  private fit(text: string, font: PDFFont, size: number, width: number) {
    if (font.widthOfTextAtSize(text, size) <= width) return text;
    const characters = Array.from(text);
    let low = 0;
    let high = characters.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (font.widthOfTextAtSize(`${characters.slice(0, middle).join('')}…`, size) <= width) low = middle;
      else high = middle - 1;
    }
    return `${characters.slice(0, low).join('')}…`;
  }

  summary(model: TestResultPdfModel) {
    const scoreWidth = 122;
    const leftWidth = CONTENT_WIDTH - scoreWidth - 28;
    this.rule(this.y, ROMAN_RED);
    this.y -= 15;
    this.draw(`${model.kindLabel.toUpperCase()} RESULTS`, MARGIN_X, this.y, LABEL_SIZE, this.bold, ROMAN_RED);
    this.y -= 17;
    const top = this.y;
    // Pathological titles are flowed below the score, keeping every character.
    const title = this.lines(model.title, this.serif, 23, leftWidth);
    const firstLines = title.splice(0, 4);
    for (const line of firstLines) {
      this.draw(line, MARGIN_X, this.y, 23, this.serif, ROMAN_RED);
      this.y -= 29;
    }
    const right = PAGE_WIDTH - MARGIN_X;
    const scoreSize = 30;
    this.draw(
      model.percentageLabel,
      right - this.bold.widthOfTextAtSize(model.percentageLabel, scoreSize),
      top,
      scoreSize,
      this.bold,
      ROMAN_RED
    );
    const score = `${model.scoreLabel} / ${model.maxScoreLabel} points`;
    this.draw(score, right - this.regular.widthOfTextAtSize(score, 9), top - 37, 9, this.regular, MUTED);
    if (model.outcomeLabel && model.outcomeLabel !== 'Score only') {
      this.draw(
        model.outcomeLabel,
        right - this.bold.widthOfTextAtSize(model.outcomeLabel, 8),
        top - 53,
        8,
        this.bold,
        INK
      );
    }
    if (title.length) {
      this.y = Math.min(this.y, top - 72);
      this.block({ columns: [{ lines: title }], serif: true, size: 23 });
    }
    this.y -= 8;
    this.block({ columns: [{ lines: [model.studentName] }], size: 11, gap: 3, maxWidth: leftWidth });
    this.block({
      columns: [{ lines: [`Submitted ${model.submittedAtLabel}`], color: MUTED }],
      size: 8,
      gap: 0,
      maxWidth: leftWidth,
    });
    this.y = Math.min(this.y, top - 72) - 20;
  }

  private measure(block: Block, showLabels = !block.grid || Boolean(block.headerRow)) {
    const size = block.size ?? BODY_SIZE;
    const leading = Math.max(LEADING, size + 5);
    const font = block.serif ? this.serif : this.regular;
    const inset = block.inset ?? 0;
    const gutter = block.columns.length > 1 && !block.grid ? 12 : 0;
    const width = ((block.maxWidth ?? CONTENT_WIDTH) - gutter * (block.columns.length - 1)) / block.columns.length;
    const columns = block.columns.map(column => ({
      ...column,
      body: column.lines.flatMap(line => this.lines(line, font, size, width - inset * 2)),
      labels:
        showLabels && column.label
          ? this.lines(column.label.toUpperCase(), this.bold, LABEL_SIZE, width - inset * 2)
          : [],
    }));
    const labelHeight = Math.max(0, ...columns.map(column => column.labels.length)) * 11;
    const rows = block.headerRow ? 0 : Math.max(1, ...columns.map(column => column.body.length));
    const height = inset * 2 + labelHeight + rows * leading + (block.gap ?? 8);
    return { size, leading, font, inset, gutter, width, columns, labelHeight, rows, height };
  }

  private replayTableHeader(block: Block) {
    if (!block.grid || block.headerRow || !block.columns.some(column => column.label)) return;
    this.block({
      columns: block.columns.map(column => ({ label: column.label, lines: [] })),
      grid: true,
      headerRow: true,
      size: block.size,
      inset: 6,
      gap: 0,
    });
  }

  block(block: Block) {
    const headerRow = Boolean(block.headerRow);
    let showLabels = !block.grid || headerRow;
    let layout = this.measure(block, showLabels);
    const freshSpace = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM - this.continuationHeight();
    const startOnNewPage = () => {
      this.addPage();
      if (block.grid && !headerRow) this.replayTableHeader(block);
    };
    if (layout.height > this.remaining() && layout.height <= freshSpace) {
      startOnNewPage();
      showLabels = headerRow;
    }
    if (headerRow) {
      layout = this.measure(block, true);
      const gap = block.gap ?? 0;
      if (layout.height + gap > this.remaining()) this.addPage();
      layout = this.measure(block, true);
      const { inset, gutter, width, columns, labelHeight } = layout;
      const height = inset * 2 + labelHeight;
      columns.forEach((column, index) => {
        const x = MARGIN_X + index * (width + gutter);
        this.page.drawRectangle({ x, y: this.y - height, width, height, color: PARCHMENT });
        this.page.drawRectangle({ x, y: this.y - height, width, height, borderColor: RULE, borderWidth: 0.5 });
        let cursor = this.y - inset;
        for (const label of column.labels) {
          this.draw(label, x + inset, cursor, LABEL_SIZE, this.bold, MUTED);
          cursor -= 11;
        }
      });
      this.y -= height + gap;
      return;
    }
    let offset = 0;
    while (offset < layout.rows) {
      layout = this.measure(block, showLabels);
      let overhead = layout.inset * 2 + layout.labelHeight;
      const gap = block.gap ?? 8;
      let capacity = Math.floor((this.remaining() - overhead - gap) / layout.leading);
      if (capacity < 1) {
        startOnNewPage();
        showLabels = !block.grid;
        layout = this.measure(block, showLabels);
        overhead = layout.inset * 2 + layout.labelHeight;
        capacity = Math.max(1, Math.floor((this.remaining() - overhead - gap) / layout.leading));
      }
      const { size, leading, font, inset, gutter, width, columns, labelHeight, rows } = layout;
      const count = Math.min(rows - offset, capacity);
      const height = overhead + count * leading;
      columns.forEach((column, index) => {
        const x = MARGIN_X + index * (width + gutter);
        if (column.fill) this.page.drawRectangle({ x, y: this.y - height, width, height, color: column.fill });
        if (block.grid) {
          this.page.drawRectangle({ x, y: this.y - height, width, height, borderColor: RULE, borderWidth: 0.5 });
        } else if (inset) {
          this.page.drawLine({
            start: { x, y: this.y },
            end: { x: x + width, y: this.y },
            thickness: 0.6,
            color: column.color ?? RULE,
          });
        }
        let cursor = this.y - inset;
        for (const label of column.labels) {
          this.draw(label, x + inset, cursor, LABEL_SIZE, this.bold, column.color ?? MUTED);
          cursor -= 11;
        }
        cursor = this.y - inset - labelHeight;
        for (const line of column.body.slice(offset, offset + count)) {
          this.draw(line, x + inset, cursor, size, font, INK);
          cursor -= leading;
        }
      });
      this.y -= height + gap;
      offset += count;
      if (offset < rows) startOnNewPage();
    }
  }

  private headerLines(exercise: TestResultPdfExercise, continued: boolean) {
    return this.lines(`${exercise.title}${continued ? ' (continued)' : ''}`, this.serif, 14, CONTENT_WIDTH - 160);
  }

  private continuationHeight() {
    // Headers are bounded so even exceptionally long titles leave body space.
    return this.activeExercise ? Math.min(3, this.headerLines(this.activeExercise, true).length) * 19 + 26 : 0;
  }

  private exerciseHeader(exercise: TestResultPdfExercise, continued = false) {
    const lines = this.headerLines(exercise, continued);
    const visible = lines.slice(0, 3);
    if (lines.length > 3) visible[2] = this.fit(`${visible[2]}…`, this.serif, 14, CONTENT_WIDTH - 160);
    const height = visible.length * 19 + 16;
    this.page.drawRectangle({ x: MARGIN_X, y: this.y - height, width: CONTENT_WIDTH, height, color: PARCHMENT });
    this.draw(String(exercise.number).padStart(2, '0'), MARGIN_X + 12, this.y - 10, 10, this.bold, ROMAN_RED);
    visible.forEach((line, index) =>
      this.draw(line, MARGIN_X + 40, this.y - 8 - index * 19, 14, this.serif, ROMAN_RED)
    );
    const points = `${exercise.awardedPoints} / ${exercise.maxPoints}`;
    const right = PAGE_WIDTH - MARGIN_X - 12;
    this.draw(points, right - this.bold.widthOfTextAtSize(points, 10), this.y - 9, 10, this.bold, INK);
    this.draw(
      exercise.statusLabel,
      right - this.regular.widthOfTextAtSize(exercise.statusLabel, 7.5),
      this.y - 24,
      7.5,
      this.regular,
      STATUS[exercise.statusLabel].ink
    );
    this.y -= height + 12;
  }

  exercise(exercise: TestResultPdfExercise) {
    const blocks = exerciseBlocks(exercise);
    const headerHeight = Math.min(3, this.headerLines(exercise, false).length) * 19 + 28;
    const totalHeight = headerHeight + blocks.reduce((sum, block) => sum + this.measure(block).height, 0);
    this.activeExercise = undefined;
    const freshSpace = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
    if ((totalHeight <= freshSpace ? totalHeight : headerHeight + 100) > this.remaining()) this.addPage();
    this.activeExercise = exercise;
    this.exerciseHeader(exercise);
    // Preserve very long authored titles in full, outside the bounded running header.
    if (this.headerLines(exercise, false).length > 3)
      this.block({ columns: [{ lines: [exercise.title] }], serif: true, size: 12 });
    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];
      const next = blocks[index + 1];
      // Keep a question/part label with its answer when both fit a fresh page.
      if (!block.inset && next) {
        let cluster = this.measure(block).height;
        for (let ahead = index + 1; ahead < blocks.length; ahead += 1) {
          cluster += this.measure(blocks[ahead]).height;
          if (blocks[ahead].inset) break;
        }
        if (cluster > this.remaining() && cluster <= freshSpace - this.continuationHeight()) this.addPage();
      }
      this.block(block);
    }
    this.y -= 10;
    this.activeExercise = undefined;
  }

  scoreList(model: TestResultPdfModel) {
    for (const exercise of model.exerciseSummaries) {
      this.block({
        columns: [
          { lines: [`${exercise.number}. ${exercise.title}`] },
          {
            lines: [
              `${exercise.awardedPoints} / ${exercise.maxPoints}${exercise.statusLabel ? ` · ${exercise.statusLabel}` : ''}`,
            ],
          },
        ],
        gap: 10,
      });
    }
  }

  finish(model: TestResultPdfModel) {
    this.pages.forEach((page, index) => {
      const pageLabel = `${index + 1} / ${this.pages.length}`;
      const pageLabelWidth = this.regular.widthOfTextAtSize(pageLabel, 8);
      const footer = this.fit(
        `${model.studentName} · ${model.title}`,
        this.regular,
        8,
        CONTENT_WIDTH - pageLabelWidth - 20
      );
      page.drawLine({
        start: { x: MARGIN_X, y: 34 },
        end: { x: PAGE_WIDTH - MARGIN_X, y: 34 },
        thickness: 0.5,
        color: RULE,
      });
      page.drawText(footer, { x: MARGIN_X, y: 20, size: 8, font: this.regular, color: MUTED });
      page.drawText(pageLabel, {
        x: PAGE_WIDTH - MARGIN_X - pageLabelWidth,
        y: 20,
        size: 8,
        font: this.regular,
        color: MUTED,
      });
    });
  }
}

export async function renderTestResultPdf(model: TestResultPdfModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(await loadFontBytes('NotoSans-Regular.ttf'), { subset: true });
  const bold = await doc.embedFont(await loadFontBytes('NotoSans-Bold.ttf'), { subset: true });
  const serif = await doc.embedFont(await loadFontBytes('NotoSerif-Regular.ttf'), { subset: true });
  const writer = new PdfWriter(doc, regular, bold, serif);
  writer.summary(model);
  if (model.reviewUnavailableNote) writer.block({ columns: [{ lines: [model.reviewUnavailableNote], color: MUTED }] });
  // A fallback score list is useful only when there is no detailed review.
  if (!model.exercises.length) writer.scoreList(model);
  for (const exercise of model.exercises) writer.exercise(exercise);
  writer.finish(model);
  return doc.save();
}
