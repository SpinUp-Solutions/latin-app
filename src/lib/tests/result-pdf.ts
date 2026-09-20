import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFPage, rgb, type RGB } from 'pdf-lib';
import type { TestResultPdfLineGroup, TestResultPdfModel, TestResultPdfTone } from '@/src/lib/tests/result-pdf-model';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 48;
const MARGIN_TOP = 64;
const MARGIN_BOTTOM = 46;
const BODY_SIZE = 10;
const SMALL_SIZE = 8.5;
const TITLE_SIZE = 20;
const HEADING_SIZE = 12.5;
const LINE_GAP = 2.5;
const ROMAN_RED = rgb(0.55, 0.14, 0.14);
const SLATE = rgb(0.18, 0.23, 0.3);
const MUTED = rgb(0.42, 0.46, 0.52);
const RULE = rgb(0.86, 0.82, 0.77);
const PARCHMENT = rgb(0.99, 0.97, 0.94);

const TONE_STYLES: Record<TestResultPdfTone, { bg: RGB; bar: RGB; heading: RGB }> = {
  neutral: { bg: rgb(0.97, 0.97, 0.96), bar: rgb(0.62, 0.64, 0.68), heading: rgb(0.32, 0.35, 0.4) },
  student: { bg: rgb(0.93, 0.97, 1), bar: rgb(0.35, 0.58, 0.78), heading: rgb(0.16, 0.38, 0.58) },
  answer: { bg: rgb(0.92, 0.97, 0.93), bar: rgb(0.22, 0.55, 0.38), heading: rgb(0.12, 0.42, 0.28) },
  explanation: { bg: rgb(1, 0.97, 0.9), bar: rgb(0.78, 0.54, 0.18), heading: rgb(0.55, 0.35, 0.08) },
  feedback: { bg: rgb(0.96, 0.94, 0.99), bar: rgb(0.5, 0.36, 0.72), heading: rgb(0.38, 0.24, 0.58) },
};

async function loadFontBytes(fileName: string): Promise<Uint8Array> {
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
      if (bytes.byteLength > 100) return bytes;
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

  private ensureSpace(height: number) {
    if (this.y - height >= MARGIN_BOTTOM) return;
    this.addPage();
  }

  private contentWidth() {
    return PAGE_WIDTH - MARGIN_X * 2;
  }

  gap(amount = 8) {
    this.ensureSpace(amount);
    this.y -= amount;
  }

  rule() {
    this.ensureSpace(12);
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN_X, y: this.y },
      thickness: 0.8,
      color: RULE,
    });
    this.y -= 10;
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

  block(group: TestResultPdfLineGroup) {
    const tone = group.tone ?? 'neutral';
    const palette = TONE_STYLES[tone];
    const innerWidth = this.contentWidth() - 22;
    const headingLines = group.heading ? wrapParagraphs(this.bold, group.heading.toUpperCase(), 8, innerWidth) : [];
    const bodyLines = group.lines.flatMap(line => wrapParagraphs(this.regular, line, BODY_SIZE, innerWidth));
    const padding = 8;
    const headingHeight = headingLines.length * 11;
    const bodyHeight = bodyLines.length * (BODY_SIZE + LINE_GAP);
    const height = padding * 2 + headingHeight + bodyHeight + (headingLines.length && bodyLines.length ? 3 : 0);
    const maxBlock = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM - 8;

    if (height > maxBlock) {
      if (group.heading) this.text(group.heading, 8, this.bold, palette.heading, 4);
      for (const line of group.lines) this.text(line, BODY_SIZE);
      this.gap(6);
      return;
    }

    this.ensureSpace(height + 4);
    const boxY = this.y - height;
    this.page.drawRectangle({
      x: MARGIN_X,
      y: boxY,
      width: this.contentWidth(),
      height,
      color: palette.bg,
      borderColor: RULE,
      borderWidth: 0.4,
    });
    this.page.drawRectangle({ x: MARGIN_X, y: boxY, width: 4.5, height, color: palette.bar });

    let cursor = this.y - padding;
    const draw = (lines: string[], size: number, font: PDFFont, color: RGB, gap: number) => {
      for (const line of lines) {
        if (line) {
          this.page.drawText(line, { x: MARGIN_X + 12, y: cursor - size, size, font, color });
        }
        cursor -= size + gap;
      }
    };
    draw(headingLines, 8, this.bold, palette.heading, 3);
    if (headingLines.length && bodyLines.length) cursor -= 3;
    draw(bodyLines, BODY_SIZE, this.regular, SLATE, LINE_GAP);
    this.y = boxY - 8;
  }
}

const stampPages = (model: TestResultPdfModel, pages: PDFPage[], font: PDFFont) => {
  pages.forEach((page, index) => {
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH, height: 8, color: ROMAN_RED });
    page.drawText(`${model.kindLabel} result report`, {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 28,
      size: 8,
      font,
      color: ROMAN_RED,
    });
    page.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: PAGE_WIDTH - MARGIN_X - 70,
      y: PAGE_HEIGHT - 28,
      size: 8,
      font,
      color: MUTED,
    });
    page.drawLine({
      start: { x: MARGIN_X, y: 32 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: 32 },
      thickness: 0.6,
      color: RULE,
    });
    page.drawText(`${model.studentName}  ·  ${model.title}`, {
      x: MARGIN_X,
      y: 20,
      size: 8,
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
  writer.text(`${model.kindLabel} result`, SMALL_SIZE, bold, ROMAN_RED, 3);
  writer.text(model.title, TITLE_SIZE, bold, ROMAN_RED, 6);
  writer.text(`Submitted ${model.submittedAtLabel}`, SMALL_SIZE, regular, MUTED, 4);
  writer.gap(4);

  writer.block({
    heading: 'Student',
    tone: 'neutral',
    lines: [
      `Student: ${model.studentName}`,
      ...(model.studentUsername ? [`Username: ${model.studentUsername}`] : []),
      ...(model.studentEmail ? [`Email: ${model.studentEmail}`] : []),
    ],
  });
  writer.text(model.percentageLabel, 26, bold, ROMAN_RED, 4);
  writer.text(`${model.scoreLabel} / ${model.maxScoreLabel} points`, HEADING_SIZE, bold);
  if (model.outcomeLabel) writer.text(`Outcome: ${model.outcomeLabel}`, BODY_SIZE, bold);
  if (model.passingPercentageLabel) {
    writer.text(`Passing mark: ${model.passingPercentageLabel}`, SMALL_SIZE, regular, MUTED);
  }

  writer.gap(6);
  writer.rule();
  if (model.exerciseSummaries.length > 0) {
    writer.text('Exercise scores', HEADING_SIZE, bold, ROMAN_RED, 6);
    for (const exercise of model.exerciseSummaries) {
      const status = exercise.statusLabel ? `${exercise.statusLabel} · ` : '';
      writer.text(
        `${exercise.number}. ${exercise.title} — ${status}${exercise.awardedPoints} / ${exercise.maxPoints} points`,
        BODY_SIZE
      );
    }
    writer.gap(6);
  }

  if (model.reviewUnavailableNote) {
    writer.block({ heading: 'Review note', tone: 'explanation', lines: [model.reviewUnavailableNote] });
  }

  for (const exercise of model.exercises) {
    writer.rule();
    writer.text(`Exercise ${exercise.number}. ${exercise.title}`, HEADING_SIZE, bold, ROMAN_RED, 4);
    writer.text(
      `${exercise.statusLabel} · ${exercise.awardedPoints} / ${exercise.maxPoints} points`,
      SMALL_SIZE,
      regular,
      MUTED,
      6
    );
    for (const group of exercise.groups) writer.block(group);
  }

  stampPages(model, writer.pages, regular);
  return doc.save();
}
