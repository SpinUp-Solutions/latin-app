import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import type { TestResultPdfModel } from '@/src/lib/tests/result-pdf-model';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const BODY_SIZE = 10;
const SMALL_SIZE = 9;
const TITLE_SIZE = 18;
const HEADING_SIZE = 12;
const LINE_GAP = 3;
const SECTION_GAP = 10;
const ROMAN_RED = rgb(0.55, 0.14, 0.14);
const SLATE = rgb(0.2, 0.25, 0.32);
const MUTED = rgb(0.4, 0.45, 0.5);

const FONT_FILE_NAME = 'NotoSans-Regular.ttf';

let cachedFontBytes: Uint8Array | null = null;

function bundledFontPath(): string | null {
  try {
    const resolved = fileURLToPath(new URL(`./fonts/${FONT_FILE_NAME}`, import.meta.url));
    return typeof resolved === 'string' && resolved.endsWith(FONT_FILE_NAME) ? resolved : null;
  } catch {
    return null;
  }
}

async function readFontFile(candidate: string): Promise<Uint8Array | null> {
  try {
    const bytes = new Uint8Array(await readFile(candidate));
    return bytes.byteLength > 100 ? bytes : null;
  } catch {
    return null;
  }
}

async function loadUnicodeFontBytes(): Promise<Uint8Array> {
  if (cachedFontBytes) return cachedFontBytes;
  const candidates = [path.join(process.cwd(), 'src/lib/tests/fonts', FONT_FILE_NAME), bundledFontPath()].filter(
    (candidate): candidate is string => Boolean(candidate)
  );

  const errors: string[] = [];
  for (const candidate of candidates) {
    const bytes = await readFontFile(candidate);
    if (bytes) {
      cachedFontBytes = bytes;
      return bytes;
    }
    errors.push(candidate);
  }
  throw new Error(`Unicode PDF font is missing (${errors.join('; ') || 'no candidates'})`);
}

const wrapText = (font: PDFFont, text: string, size: number, maxWidth: number): string[] => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
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
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        chunk = candidate;
      } else {
        if (chunk) lines.push(chunk);
        chunk = character;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines;
};

class PdfWriter {
  private page: PDFPage;
  private y: number;

  constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont
  ) {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private ensureSpace(height: number) {
    if (this.y - height >= MARGIN) return;
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private maxWidth() {
    return PAGE_WIDTH - MARGIN * 2;
  }

  drawLines(text: string, size: number, color = SLATE, gap = LINE_GAP) {
    const lines = wrapText(this.font, text, size, this.maxWidth());
    for (const line of lines) {
      const height = size + gap;
      this.ensureSpace(height);
      this.page.drawText(line, { x: MARGIN, y: this.y - size, size, font: this.font, color });
      this.y -= height;
    }
  }

  gap(amount = SECTION_GAP) {
    this.ensureSpace(amount);
    this.y -= amount;
  }

  rule() {
    this.ensureSpace(12);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.75,
      color: rgb(0.85, 0.82, 0.78),
    });
    this.y -= 10;
  }
}

export async function renderTestResultPdf(model: TestResultPdfModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await loadUnicodeFontBytes(), { subset: true });
  const writer = new PdfWriter(doc, font);

  writer.drawLines(`${model.kindLabel} result`, SMALL_SIZE, ROMAN_RED, 2);
  writer.drawLines(model.title, TITLE_SIZE, ROMAN_RED, 6);
  writer.drawLines(`Submitted ${model.submittedAtLabel}`, SMALL_SIZE, MUTED);
  writer.gap(6);
  writer.drawLines(`Student: ${model.studentName}`, BODY_SIZE);
  if (model.studentUsername) writer.drawLines(`Username: ${model.studentUsername}`, SMALL_SIZE, MUTED);
  if (model.studentEmail) writer.drawLines(`Email: ${model.studentEmail}`, SMALL_SIZE, MUTED);
  writer.gap(8);
  writer.drawLines(model.percentageLabel, 22, ROMAN_RED, 4);
  writer.drawLines(`${model.scoreLabel} / ${model.maxScoreLabel} points`, BODY_SIZE);
  if (model.outcomeLabel) writer.drawLines(`Outcome: ${model.outcomeLabel}`, BODY_SIZE);
  if (model.passingPercentageLabel)
    writer.drawLines(`Passing mark: ${model.passingPercentageLabel}`, SMALL_SIZE, MUTED);
  writer.gap();
  writer.rule();

  if (model.exerciseSummaries.length > 0) {
    writer.drawLines('Exercise scores', HEADING_SIZE, ROMAN_RED, 6);
    for (const exercise of model.exerciseSummaries) {
      writer.drawLines(
        `${exercise.number}. ${exercise.title} — ${exercise.awardedPoints} / ${exercise.maxPoints} points`,
        BODY_SIZE
      );
    }
    writer.gap();
  }

  if (model.reviewUnavailableNote) {
    writer.drawLines(model.reviewUnavailableNote, BODY_SIZE, MUTED);
    writer.gap();
  }

  for (const exercise of model.exercises) {
    writer.rule();
    writer.drawLines(`Exercise ${exercise.number}: ${exercise.title}`, HEADING_SIZE, ROMAN_RED, 5);
    writer.drawLines(
      `${exercise.statusLabel} · ${exercise.awardedPoints} / ${exercise.maxPoints} points`,
      SMALL_SIZE,
      MUTED
    );
    writer.gap(4);
    for (const group of exercise.groups) {
      if (group.heading) writer.drawLines(group.heading, SMALL_SIZE, ROMAN_RED, 4);
      for (const line of group.lines) writer.drawLines(line, BODY_SIZE);
      writer.gap(6);
    }
  }

  return doc.save();
}
