import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFPage, rgb, type RGB } from 'pdf-lib';
import type {
  TestResultPdfExercise,
  TestResultPdfLineGroup,
  TestResultPdfModel,
  TestResultPdfTone,
} from '@/src/lib/tests/result-pdf-model';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 50;
const MARGIN_TOP = 62;
const MARGIN_BOTTOM = 48;
const BODY_SIZE = 10.5;
const SMALL_SIZE = 9;
const TITLE_SIZE = 22;
const HEADING_SIZE = 13;
const LINE_GAP = 3.2;
const GROUP_HEADING_SIZE = 9;
const ROMAN_RED = rgb(0.55, 0.14, 0.14);
const SLATE = rgb(0.16, 0.21, 0.28);
const MUTED = rgb(0.4, 0.44, 0.5);
const RULE = rgb(0.84, 0.8, 0.75);
const PARCHMENT = rgb(0.995, 0.985, 0.97);

const TONE_STYLES: Record<TestResultPdfTone, { bg: RGB; bar: RGB; heading: RGB; body: RGB }> = {
  neutral: { bg: rgb(0.97, 0.96, 0.95), bar: rgb(0.58, 0.6, 0.64), heading: rgb(0.3, 0.33, 0.38), body: SLATE },
  score: { bg: rgb(0.97, 0.96, 0.95), bar: rgb(0.55, 0.14, 0.14), heading: ROMAN_RED, body: SLATE },
  correct: {
    bg: rgb(0.9, 0.97, 0.92),
    bar: rgb(0.1, 0.46, 0.28),
    heading: rgb(0.08, 0.38, 0.22),
    body: rgb(0.1, 0.28, 0.18),
  },
  partial: {
    bg: rgb(1, 0.96, 0.88),
    bar: rgb(0.78, 0.46, 0.06),
    heading: rgb(0.55, 0.32, 0.02),
    body: rgb(0.38, 0.24, 0.04),
  },
  incorrect: {
    bg: rgb(0.99, 0.93, 0.92),
    bar: rgb(0.72, 0.16, 0.16),
    heading: rgb(0.58, 0.12, 0.12),
    body: rgb(0.38, 0.1, 0.1),
  },
  answer: {
    bg: rgb(0.88, 0.96, 0.9),
    bar: rgb(0.08, 0.48, 0.3),
    heading: rgb(0.06, 0.36, 0.22),
    body: rgb(0.08, 0.26, 0.16),
  },
  student: {
    bg: rgb(0.9, 0.95, 0.99),
    bar: rgb(0.16, 0.42, 0.68),
    heading: rgb(0.1, 0.32, 0.54),
    body: rgb(0.1, 0.24, 0.4),
  },
};

const STATUS_TONE: Record<TestResultPdfExercise['statusLabel'], TestResultPdfTone> = {
  Correct: 'correct',
  'Partly correct': 'partial',
  Incorrect: 'incorrect',
};

const overallTone = (model: TestResultPdfModel): TestResultPdfTone => {
  if (model.outcomeLabel === 'Passed') return 'correct';
  if (model.outcomeLabel === 'Not passed') return 'incorrect';
  return 'score';
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

const usableHeight = () => PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;

class PdfWriter {
  private page!: PDFPage;
  private y = 0;
  readonly pages: PDFPage[] = [];

  constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont
  ) {
    this.addPage();
  }

  private addPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    this.page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: PARCHMENT });
    this.y = PAGE_HEIGHT - MARGIN_TOP;
  }

  private remaining() {
    return this.y - MARGIN_BOTTOM;
  }

  private ensureSpace(height: number) {
    if (this.remaining() >= height) return;
    this.addPage();
  }

  private contentWidth() {
    return PAGE_WIDTH - MARGIN_X * 2;
  }

  gap(amount = 10) {
    this.ensureSpace(amount);
    this.y -= amount;
  }

  rule() {
    this.ensureSpace(14);
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN_X, y: this.y },
      thickness: 0.7,
      color: RULE,
    });
    this.y -= 12;
  }

  text(value: string, size: number, font = this.regular, color = SLATE, gap = LINE_GAP, width = this.contentWidth()) {
    const lines = wrapParagraphs(font, value, size, width);
    for (const line of lines) {
      const height = size + gap;
      this.ensureSpace(height);
      if (line) {
        this.page.drawText(line, { x: MARGIN_X, y: this.y - size, size, font, color });
      }
      this.y -= height;
    }
  }

  private wrappedBlock(group: TestResultPdfLineGroup) {
    const innerWidth = this.contentWidth() - 26;
    const headingLines = group.heading ? wrapParagraphs(this.bold, group.heading, GROUP_HEADING_SIZE, innerWidth) : [];
    const bodyLines = group.lines.flatMap(line => wrapParagraphs(this.regular, line, BODY_SIZE, innerWidth));
    const padding = 10;
    const headingHeight = headingLines.length * (GROUP_HEADING_SIZE + 3);
    const bodyHeight = bodyLines.length * (BODY_SIZE + LINE_GAP);
    const height = padding * 2 + headingHeight + bodyHeight + (headingLines.length && bodyLines.length ? 4 : 0);
    return { headingLines, bodyLines, height, padding };
  }

  block(group: TestResultPdfLineGroup) {
    const tone = group.tone ?? 'neutral';
    const palette = TONE_STYLES[tone];
    const { headingLines, bodyLines, height, padding } = this.wrappedBlock(group);
    const maxBlock = usableHeight() - 8;

    if (height > maxBlock) {
      if (group.heading) this.text(group.heading, GROUP_HEADING_SIZE, this.bold, palette.heading, 4);
      for (const line of group.lines) this.text(line, BODY_SIZE, this.regular, palette.body);
      this.gap(8);
      return;
    }

    this.ensureSpace(height + 6);
    const boxY = this.y - height;
    this.page.drawRectangle({
      x: MARGIN_X,
      y: boxY,
      width: this.contentWidth(),
      height,
      color: palette.bg,
      borderColor: rgb(palette.bar.red, palette.bar.green, palette.bar.blue),
      borderWidth: 0.35,
    });
    this.page.drawRectangle({ x: MARGIN_X, y: boxY, width: 6.5, height, color: palette.bar });

    let cursor = this.y - padding;
    const draw = (lines: string[], size: number, font: PDFFont, color: RGB, gap: number) => {
      for (const line of lines) {
        if (line) {
          this.page.drawText(line, { x: MARGIN_X + 16, y: cursor - size, size, font, color });
        }
        cursor -= size + gap;
      }
    };
    draw(headingLines, GROUP_HEADING_SIZE, this.bold, palette.heading, 3);
    if (headingLines.length && bodyLines.length) cursor -= 4;
    draw(bodyLines, BODY_SIZE, this.regular, palette.body, LINE_GAP);
    this.y = boxY - 9;
  }

  exercise(exercise: TestResultPdfExercise) {
    const statusTone = STATUS_TONE[exercise.statusLabel];
    const palette = TONE_STYLES[statusTone];
    const scoreLines = wrapParagraphs(
      this.bold,
      `${exercise.statusLabel}  ·  ${exercise.awardedPoints} / ${exercise.maxPoints} points`,
      15,
      this.contentWidth() - 28
    );
    const titleLines = wrapParagraphs(
      this.regular,
      `Exercise ${exercise.number}. ${exercise.title}`,
      SMALL_SIZE,
      this.contentWidth() - 28
    );
    const bannerHeight = 20 + scoreLines.length * 18 + titleLines.length * (SMALL_SIZE + 3);
    const groupsHeight = exercise.groups.reduce((sum, group) => {
      const height = this.wrappedBlock(group).height;
      return sum + Math.min(height, usableHeight() - 8) + 9;
    }, 0);
    const estimated = bannerHeight + groupsHeight + 8;
    if (estimated <= usableHeight()) this.ensureSpace(estimated);
    else this.ensureSpace(bannerHeight + 72);
    this.ensureSpace(bannerHeight);
    const boxY = this.y - bannerHeight;
    this.page.drawRectangle({
      x: MARGIN_X,
      y: boxY,
      width: this.contentWidth(),
      height: bannerHeight,
      color: palette.bg,
      borderColor: palette.bar,
      borderWidth: 0.45,
    });
    this.page.drawRectangle({ x: MARGIN_X, y: boxY, width: 7, height: bannerHeight, color: palette.bar });

    let cursor = this.y - 12;
    for (const line of scoreLines) {
      this.page.drawText(line, {
        x: MARGIN_X + 16,
        y: cursor - 15,
        size: 15,
        font: this.bold,
        color: palette.heading,
      });
      cursor -= 18;
    }
    cursor -= 2;
    for (const line of titleLines) {
      this.page.drawText(line, {
        x: MARGIN_X + 16,
        y: cursor - SMALL_SIZE,
        size: SMALL_SIZE,
        font: this.regular,
        color: SLATE,
      });
      cursor -= SMALL_SIZE + 3;
    }
    this.y = boxY - 12;

    for (const group of exercise.groups) this.block(group);
  }
}

const stampPages = (model: TestResultPdfModel, pages: PDFPage[], font: PDFFont) => {
  pages.forEach((page, index) => {
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH, height: 8, color: ROMAN_RED });
    page.drawText(`${model.kindLabel} result report`, {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 28,
      size: 8.5,
      font,
      color: ROMAN_RED,
    });
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    page.drawText(pageLabel, {
      x: PAGE_WIDTH - MARGIN_X - font.widthOfTextAtSize(pageLabel, 8.5),
      y: PAGE_HEIGHT - 28,
      size: 8.5,
      font,
      color: MUTED,
    });
    page.drawLine({
      start: { x: MARGIN_X, y: 34 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: 34 },
      thickness: 0.6,
      color: RULE,
    });
    page.drawText(`${model.studentName}  ·  ${model.title}`, {
      x: MARGIN_X,
      y: 20,
      size: 8.5,
      font,
      color: MUTED,
    });
  });
};

export async function renderTestResultPdf(model: TestResultPdfModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(await loadFontBytes('NotoSans-Regular.ttf'), { subset: true });
  let bold = regular;
  try {
    bold = await doc.embedFont(await loadFontBytes('NotoSans-Bold.ttf'), { subset: true });
  } catch {
    bold = regular;
  }

  const writer = new PdfWriter(doc, regular, bold);
  writer.text(`${model.kindLabel} result`, SMALL_SIZE, bold, ROMAN_RED, 4);
  writer.text(model.title, TITLE_SIZE, bold, ROMAN_RED, 7);
  writer.text(`Submitted ${model.submittedAtLabel}`, SMALL_SIZE, regular, MUTED, 5);
  writer.gap(6);

  writer.block({
    heading: 'Student',
    tone: 'neutral',
    lines: [
      model.studentName,
      ...(model.studentUsername ? [`Username: ${model.studentUsername}`] : []),
      ...(model.studentEmail ? [`Email: ${model.studentEmail}`] : []),
    ],
  });
  writer.block({
    heading: 'Overall score',
    tone: overallTone(model),
    lines: [
      `${model.percentageLabel}  ·  ${model.scoreLabel} / ${model.maxScoreLabel} points`,
      ...(model.outcomeLabel ? [`Outcome: ${model.outcomeLabel}`] : []),
      ...(model.passingPercentageLabel ? [`Passing mark: ${model.passingPercentageLabel}`] : []),
    ],
  });

  writer.gap(4);
  writer.rule();
  if (model.exerciseSummaries.length > 0) {
    writer.text('Exercise scores', HEADING_SIZE, bold, ROMAN_RED, 8);
    for (const exercise of model.exerciseSummaries) {
      const status = exercise.statusLabel ? `${exercise.statusLabel}  ·  ` : '';
      const tone = exercise.statusLabel ? STATUS_TONE[exercise.statusLabel] : 'neutral';
      writer.text(
        `${exercise.number}. ${exercise.title}  —  ${status}${exercise.awardedPoints} / ${exercise.maxPoints} points`,
        BODY_SIZE,
        regular,
        TONE_STYLES[tone].heading,
        5
      );
    }
    writer.gap(8);
  }

  if (model.reviewUnavailableNote) {
    writer.block({ heading: 'Review note', tone: 'neutral', lines: [model.reviewUnavailableNote] });
  }

  for (const exercise of model.exercises) writer.exercise(exercise);

  stampPages(model, writer.pages, regular);
  return doc.save();
}
