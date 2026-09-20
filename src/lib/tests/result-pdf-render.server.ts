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
const MARGIN_X = 48;
const MARGIN_TOP = 44;
const MARGIN_BOTTOM = 40;
const BODY_SIZE = 10;
const SMALL_SIZE = 8;
const TITLE_SIZE = 18;
const LINE_GAP = 2;
const LABEL_SIZE = 7;
const PILL_RADIUS = 7;
const CARD_RADIUS = 10;
const MIN_EXERCISE_KEEP = 92;

const hex = (value: string): RGB => {
  const n = Number.parseInt(value.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

const ROMAN_RED = hex('#8B2635');
const MARBLE = hex('#F5F5F5');
const WHITE = rgb(1, 1, 1);
const SLATE_900 = hex('#0f172a');
const SLATE_700 = hex('#334155');
const SLATE_500 = hex('#64748b');
const SLATE_200 = hex('#e2e8f0');
const BORDER = hex('#e8e4de');
const EMERALD_50 = hex('#ecfdf5');
const EMERALD_100 = hex('#d1fae5');
const EMERALD_300 = hex('#6ee7b7');
const EMERALD_800 = hex('#065f46');
const ROSE_50 = hex('#fff1f2');
const ROSE_100 = hex('#ffe4e6');
const ROSE_800 = hex('#9f1239');
const AMBER_50 = hex('#fffbeb');
const AMBER_100 = hex('#fef3c7');
const AMBER_300 = hex('#fcd34d');
const AMBER_800 = hex('#92400e');

const STATUS_PILL: Record<TestResultPdfExercise['statusLabel'], { bg: RGB; bar: RGB; text: RGB; fill: RGB }> = {
  Correct: { bg: EMERALD_100, bar: EMERALD_800, text: EMERALD_800, fill: EMERALD_50 },
  'Partly correct': { bg: AMBER_100, bar: AMBER_800, text: AMBER_800, fill: AMBER_50 },
  Incorrect: { bg: ROSE_100, bar: ROSE_800, text: ROSE_800, fill: ROSE_50 },
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

const isStudentGroup = (group: TestResultPdfLineGroup) =>
  Boolean(group.heading?.startsWith('Student')) || group.tone === 'student';

const isExpectedGroup = (group: TestResultPdfLineGroup) =>
  Boolean(group.heading?.startsWith('Expected')) || group.tone === 'answer';

const isQuestionGroup = (group: TestResultPdfLineGroup) =>
  group.heading === 'Question' || Boolean(group.heading?.startsWith('Question '));

const isScoreGroup = (group: TestResultPdfLineGroup) => {
  const tone = group.tone ?? 'neutral';
  return tone === 'score' || tone === 'correct' || tone === 'partial' || tone === 'incorrect';
};

const statusFromTone = (tone?: TestResultPdfTone): TestResultPdfExercise['statusLabel'] => {
  if (tone === 'correct') return 'Correct';
  if (tone === 'partial') return 'Partly correct';
  return 'Incorrect';
};

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
    this.page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: MARBLE });
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

  gap(amount = 6) {
    this.ensureSpace(amount);
    this.y -= amount;
  }

  private roundedRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill?: RGB,
    border?: RGB,
    borderWidth = 0.8
  ) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    if (fill) {
      this.page.drawRectangle({ x: x + r, y, width: width - r * 2, height, color: fill });
      this.page.drawRectangle({ x, y: y + r, width, height: height - r * 2, color: fill });
      this.page.drawEllipse({ x: x + r, y: y + r, xScale: r, yScale: r, color: fill });
      this.page.drawEllipse({ x: x + width - r, y: y + r, xScale: r, yScale: r, color: fill });
      this.page.drawEllipse({ x: x + r, y: y + height - r, xScale: r, yScale: r, color: fill });
      this.page.drawEllipse({ x: x + width - r, y: y + height - r, xScale: r, yScale: r, color: fill });
    }
    if (border) {
      this.page.drawRectangle({
        x,
        y,
        width,
        height,
        borderColor: border,
        borderWidth,
      });
    }
  }

  private textLines(lines: string[], x: number, top: number, size: number, font: PDFFont, color: RGB, gap: number) {
    let cursor = top;
    for (const line of lines) {
      if (line) this.page.drawText(line, { x, y: cursor - size, size, font, color });
      cursor -= size + gap;
    }
    return cursor;
  }

  private drawPill(label: string, xRight: number, yBottom: number, status: TestResultPdfExercise['statusLabel']) {
    const pill = STATUS_PILL[status];
    const width = this.bold.widthOfTextAtSize(label, 7.5) + 12;
    this.roundedRect(xRight - width, yBottom, width, 14, PILL_RADIUS, pill.bg);
    this.page.drawText(label, {
      x: xRight - width + 6,
      y: yBottom + 3.6,
      size: 7.5,
      font: this.bold,
      color: pill.text,
    });
    return width;
  }

  private wrapBody(lines: string[], width: number, size = BODY_SIZE) {
    return lines.flatMap(line => wrapParagraphs(this.regular, line, size, width));
  }

  summaryCard(model: TestResultPdfModel) {
    const width = this.contentWidth();
    const inner = width - 28;
    const kicker = `${model.kindLabel} result review`;
    const titleLines = wrapParagraphs(this.bold, model.title, TITLE_SIZE, inner);
    const scoreLine = `${model.scoreLabel} / ${model.maxScoreLabel} points`;
    const outcomeBits = [
      ...(model.outcomeLabel ? [model.outcomeLabel] : []),
      ...(model.passingPercentageLabel ? [`Passing mark ${model.passingPercentageLabel}`] : []),
    ];
    const meta = [
      model.studentName,
      ...(model.studentUsername ? [model.studentUsername] : []),
      ...(model.studentEmail ? [model.studentEmail] : []),
      `Submitted ${model.submittedAtLabel}`,
    ].join('  ·  ');
    const metaLines = wrapParagraphs(this.regular, meta, SMALL_SIZE, inner);
    const percentSize = 32;
    const height =
      12 +
      12 +
      titleLines.length * (TITLE_SIZE + 2) +
      percentSize +
      8 +
      14 +
      (outcomeBits.length ? 12 : 0) +
      metaLines.length * (SMALL_SIZE + 2) +
      18;
    this.ensureSpace(height + 6);
    const boxY = this.y - height;
    const border =
      model.outcomeLabel === 'Not passed' ? AMBER_300 : model.outcomeLabel === 'Passed' ? EMERALD_300 : BORDER;
    this.roundedRect(MARGIN_X, boxY, width, height, CARD_RADIUS, WHITE, border);
    this.page.drawRectangle({ x: MARGIN_X, y: boxY + height - 4, width, height: 4, color: ROMAN_RED });
    let cursor = this.y - 14;
    const kickerWidth = this.bold.widthOfTextAtSize(kicker, SMALL_SIZE);
    this.page.drawText(kicker, {
      x: MARGIN_X + (width - kickerWidth) / 2,
      y: cursor - SMALL_SIZE,
      size: SMALL_SIZE,
      font: this.bold,
      color: ROMAN_RED,
    });
    cursor -= SMALL_SIZE + 6;
    for (const line of titleLines) {
      const lineWidth = this.bold.widthOfTextAtSize(line, TITLE_SIZE);
      this.page.drawText(line, {
        x: MARGIN_X + (width - lineWidth) / 2,
        y: cursor - TITLE_SIZE,
        size: TITLE_SIZE,
        font: this.bold,
        color: SLATE_900,
      });
      cursor -= TITLE_SIZE + 2;
    }
    cursor -= 4;
    const percentWidth = this.bold.widthOfTextAtSize(model.percentageLabel, percentSize);
    this.page.drawText(model.percentageLabel, {
      x: MARGIN_X + (width - percentWidth) / 2,
      y: cursor - percentSize,
      size: percentSize,
      font: this.bold,
      color: ROMAN_RED,
    });
    cursor -= percentSize + 6;
    const scoreWidth = this.regular.widthOfTextAtSize(scoreLine, BODY_SIZE);
    this.page.drawText(scoreLine, {
      x: MARGIN_X + (width - scoreWidth) / 2,
      y: cursor - BODY_SIZE,
      size: BODY_SIZE,
      font: this.regular,
      color: SLATE_700,
    });
    cursor -= BODY_SIZE + 3;
    if (outcomeBits.length) {
      const outcome = outcomeBits.join('  ·  ');
      const outcomeWidth = this.regular.widthOfTextAtSize(outcome, SMALL_SIZE);
      this.page.drawText(outcome, {
        x: MARGIN_X + (width - outcomeWidth) / 2,
        y: cursor - SMALL_SIZE,
        size: SMALL_SIZE,
        font: this.regular,
        color: SLATE_500,
      });
      cursor -= SMALL_SIZE + 4;
    }
    cursor -= 4;
    for (const line of metaLines) {
      const lineWidth = this.regular.widthOfTextAtSize(line, SMALL_SIZE);
      this.page.drawText(line, {
        x: MARGIN_X + (width - lineWidth) / 2,
        y: cursor - SMALL_SIZE,
        size: SMALL_SIZE,
        font: this.regular,
        color: SLATE_500,
      });
      cursor -= SMALL_SIZE + 2;
    }
    this.y = boxY - 10;
  }

  scoreList(model: TestResultPdfModel) {
    if (model.exerciseSummaries.length === 0) return;
    this.ensureSpace(22);
    this.page.drawText('Exercise scores', {
      x: MARGIN_X,
      y: this.y - 11,
      size: 11,
      font: this.bold,
      color: SLATE_900,
    });
    this.y -= 16;
    for (const exercise of model.exerciseSummaries) {
      const status = exercise.statusLabel ?? 'Incorrect';
      const left = `${exercise.number}. ${exercise.title}`;
      const right = `${status}  ${exercise.awardedPoints}/${exercise.maxPoints}`;
      const leftLines = wrapParagraphs(this.regular, left, BODY_SIZE, this.contentWidth() - 150);
      const height = Math.max(16, leftLines.length * 13);
      this.ensureSpace(height);
      this.textLines(leftLines, MARGIN_X, this.y, BODY_SIZE, this.regular, SLATE_700, 2);
      const rightWidth = this.bold.widthOfTextAtSize(right, SMALL_SIZE);
      this.page.drawText(right, {
        x: PAGE_WIDTH - MARGIN_X - rightWidth,
        y: this.y - BODY_SIZE,
        size: SMALL_SIZE,
        font: this.bold,
        color: STATUS_PILL[status].text,
      });
      this.y -= height;
    }
    this.y -= 8;
  }

  private hairline() {
    this.ensureSpace(8);
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y - 2 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: this.y - 2 },
      thickness: 0.5,
      color: SLATE_200,
    });
    this.y -= 8;
  }

  private exerciseHeader(exercise: TestResultPdfExercise) {
    const titleWidth = this.contentWidth() - 150;
    const titleLines = wrapParagraphs(this.bold, exercise.title, 11, titleWidth);
    const height = 18 + titleLines.length * 13;
    this.ensureSpace(height + MIN_EXERCISE_KEEP - 18);
    const circleX = MARGIN_X + 8;
    const circleY = this.y - 12;
    const circle = STATUS_PILL[exercise.statusLabel];
    this.page.drawEllipse({ x: circleX, y: circleY, xScale: 8, yScale: 8, color: circle.bg });
    const number = String(exercise.number);
    const numberWidth = this.bold.widthOfTextAtSize(number, 8);
    this.page.drawText(number, {
      x: circleX - numberWidth / 2,
      y: circleY - 2.8,
      size: 8,
      font: this.bold,
      color: circle.text,
    });
    this.textLines(titleLines, MARGIN_X + 22, this.y - 2, 11, this.bold, SLATE_900, 2);
    const points = `${exercise.awardedPoints} / ${exercise.maxPoints}`;
    const pointsWidth = this.regular.widthOfTextAtSize(points, SMALL_SIZE);
    this.drawPill(exercise.statusLabel, PAGE_WIDTH - MARGIN_X, this.y - 16, exercise.statusLabel);
    this.page.drawText(points, {
      x: PAGE_WIDTH - MARGIN_X - pointsWidth,
      y: this.y - 28,
      size: SMALL_SIZE,
      font: this.regular,
      color: SLATE_500,
    });
    this.y -= height;
  }

  private drawQuestion(group: TestResultPdfLineGroup) {
    const width = this.contentWidth();
    const bodyLines = this.wrapBody(group.lines, width, 11);
    const height = 11 + bodyLines.length * (11 + 2);
    this.ensureSpace(height + 4);
    this.page.drawText('QUESTION', {
      x: MARGIN_X,
      y: this.y - LABEL_SIZE,
      size: LABEL_SIZE,
      font: this.bold,
      color: SLATE_500,
    });
    this.y -= LABEL_SIZE + 4;
    this.y = this.textLines(bodyLines, MARGIN_X, this.y, 11, this.regular, SLATE_900, 2);
    this.y -= 4;
  }

  private drawScoreLine(group: TestResultPdfLineGroup) {
    const statusLine = group.lines.find(line => /correct|incorrect|not scored/i.test(line));
    const extra = group.lines.filter(line => line !== statusLine);
    const title = group.heading ?? '';
    const status = statusFromTone(group.tone);
    const pillLabel = statusLine?.split(' · ')[0] ?? status;
    const points = statusLine?.includes(' · ') ? statusLine.split(' · ')[1] : undefined;
    const detail = [points, ...extra].filter((line): line is string => Boolean(line));
    const titleLines = title ? wrapParagraphs(this.bold, title, 9, this.contentWidth() - 120) : [];
    const extraLines = this.wrapBody(detail, this.contentWidth(), SMALL_SIZE);
    const height = 4 + Math.max(16, titleLines.length * 12) + extraLines.length * (SMALL_SIZE + 1.5);
    this.ensureSpace(height);
    this.textLines(titleLines, MARGIN_X, this.y, 9, this.bold, SLATE_700, 2);
    if (pillLabel) this.drawPill(pillLabel, PAGE_WIDTH - MARGIN_X, this.y - 14, status);
    this.y -= Math.max(16, titleLines.length * 12);
    if (extraLines.length) {
      this.y = this.textLines(extraLines, MARGIN_X, this.y, SMALL_SIZE, this.regular, SLATE_500, 1.5);
    }
    this.y -= 3;
  }

  private answerBlockHeight(group: TestResultPdfLineGroup, padded: boolean) {
    const inner = this.contentWidth() - (padded ? 16 : 0);
    const headingLines = group.heading ? wrapParagraphs(this.bold, group.heading.toUpperCase(), LABEL_SIZE, inner) : [];
    const bodyLines = this.wrapBody(group.lines, inner);
    const pad = padded ? 5 : 1;
    return pad * 2 + headingLines.length * (LABEL_SIZE + 1.5) + bodyLines.length * (BODY_SIZE + 1.8) + 2;
  }

  private drawExpected(group: TestResultPdfLineGroup) {
    const width = this.contentWidth();
    const heading = (group.heading ?? 'Expected answer').toUpperCase();
    const bodyLines = this.wrapBody(group.lines, width);
    const height = 10 + bodyLines.length * (BODY_SIZE + 1.8);
    this.ensureSpace(height + 2);
    this.page.drawText(heading, {
      x: MARGIN_X,
      y: this.y - LABEL_SIZE,
      size: LABEL_SIZE,
      font: this.bold,
      color: EMERALD_800,
    });
    this.y -= LABEL_SIZE + 3;
    this.y = this.textLines(bodyLines, MARGIN_X, this.y, BODY_SIZE, this.regular, SLATE_900, 1.8);
    this.y -= 3;
  }

  private drawStudent(group: TestResultPdfLineGroup) {
    const status = statusFromTone(group.tone === 'student' ? 'correct' : group.tone);
    const colors = STATUS_PILL[status];
    const heading = (group.heading ?? 'Student answer').toUpperCase();
    const inner = this.contentWidth() - 16;
    const headingLines = wrapParagraphs(this.bold, heading, LABEL_SIZE, inner);
    const bodyLines = this.wrapBody(group.lines, inner);
    const pad = 5;
    const height = pad * 2 + headingLines.length * (LABEL_SIZE + 1.5) + bodyLines.length * (BODY_SIZE + 1.8);
    this.ensureSpace(height + 4);
    const boxY = this.y - height;
    this.page.drawRectangle({
      x: MARGIN_X,
      y: boxY,
      width: this.contentWidth(),
      height,
      color: colors.fill,
    });
    this.page.drawRectangle({
      x: MARGIN_X,
      y: boxY,
      width: 3,
      height,
      color: colors.bar,
    });
    let cursor = this.y - pad;
    cursor = this.textLines(headingLines, MARGIN_X + 10, cursor, LABEL_SIZE, this.bold, colors.text, 1.5);
    cursor -= 1;
    this.textLines(bodyLines, MARGIN_X + 10, cursor, BODY_SIZE, this.regular, SLATE_900, 1.8);
    this.y = boxY - 6;
  }

  private drawPrompt(group: TestResultPdfLineGroup) {
    const width = this.contentWidth();
    const heading = group.heading ? group.heading.toUpperCase() : '';
    const bodyLines = this.wrapBody(group.lines, width);
    const height = (heading ? 10 : 0) + bodyLines.length * (BODY_SIZE + LINE_GAP);
    this.ensureSpace(height + 2);
    if (heading) {
      this.page.drawText(heading, {
        x: MARGIN_X,
        y: this.y - LABEL_SIZE,
        size: LABEL_SIZE,
        font: this.bold,
        color: SLATE_500,
      });
      this.y -= LABEL_SIZE + 3;
    }
    this.y = this.textLines(bodyLines, MARGIN_X, this.y, BODY_SIZE, this.regular, SLATE_700, LINE_GAP);
    this.y -= 3;
  }

  reviewNote(text: string) {
    this.drawPrompt({ heading: 'Review note', tone: 'neutral', lines: [text] });
  }

  exercise(exercise: TestResultPdfExercise) {
    if (this.remaining() < MIN_EXERCISE_KEEP) this.addPage();
    this.hairline();
    this.exerciseHeader(exercise);
    for (let index = 0; index < exercise.groups.length; index += 1) {
      const group = exercise.groups[index]!;
      const next = exercise.groups[index + 1];
      if (isExpectedGroup(group) && next && isStudentGroup(next)) {
        const pairHeight = this.answerBlockHeight(group, false) + this.answerBlockHeight(next, true) + 8;
        this.ensureSpace(Math.min(pairHeight, 64));
        this.drawExpected(group);
        this.drawStudent(next);
        index += 1;
        continue;
      }
      if (isStudentGroup(group)) {
        this.drawStudent(group);
        continue;
      }
      if (isExpectedGroup(group)) {
        this.drawExpected(group);
        continue;
      }
      if (isQuestionGroup(group)) {
        this.drawQuestion(group);
        continue;
      }
      if (isScoreGroup(group)) {
        this.drawScoreLine(group);
        continue;
      }
      this.drawPrompt(group);
    }
    this.gap(8);
  }
}

const stampPages = (model: TestResultPdfModel, pages: PDFPage[], font: PDFFont) => {
  pages.forEach((page, index) => {
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 4, width: PAGE_WIDTH, height: 4, color: ROMAN_RED });
    const pageLabel = `${index + 1} / ${pages.length}`;
    page.drawText(pageLabel, {
      x: PAGE_WIDTH - MARGIN_X - font.widthOfTextAtSize(pageLabel, 8),
      y: 18,
      size: 8,
      font,
      color: SLATE_500,
    });
    page.drawText(`${model.studentName}  ·  ${model.title}`, {
      x: MARGIN_X,
      y: 18,
      size: 8,
      font,
      color: SLATE_500,
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
  writer.summaryCard(model);
  writer.scoreList(model);

  if (model.reviewUnavailableNote) writer.reviewNote(model.reviewUnavailableNote);

  for (const exercise of model.exercises) writer.exercise(exercise);

  stampPages(model, writer.pages, regular);
  return doc.save();
}
