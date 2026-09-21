/** @jest-environment node */

import { renderTestResultPdf } from '@/src/lib/tests/result-pdf-render.server';
import { buildTestResultPdfModel, RESULT_PDF_PAIR_SEPARATOR } from '@/src/lib/tests/result-pdf-model';
import type { StudentTestResult, TestResultReviewItem } from '@/src/types/test-results';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFPage } from 'pdf-lib';
import type { TestResultPdfModel } from '@/src/lib/tests/result-pdf-model';

const submittedAt = '2026-08-19T12:00:00.000Z';

const result: StudentTestResult = {
  attempt: {
    id: 'attempt-1',
    versionId: 'version-1',
    passingPercentage: 70,
    origin: { kind: 'normal-test', testId: 'test-1' },
    startedAt: submittedAt,
    updatedAt: submittedAt,
    status: 'submitted',
    exerciseResults: {},
    score: 8,
    maxScore: 10,
    percentage: 80,
    outcome: 'passed',
    submittedAt,
  },
  review: {
    id: 'attempt-1',
    reviewVersion: 1,
    attemptId: 'attempt-1',
    versionId: 'version-1',
    origin: { kind: 'normal-test', testId: 'test-1' },
    submittedAt,
    content: {
      pages: [
        {
          id: 'page-0',
          title: 'Page 1',
          items: [
            {
              id: 'ex-fill-1',
              type: 'fill',
              title: 'Fill amō',
              instructions: '',
              maxPoints: 10,
              studentAnswer: { type: 'fill', answers: ['love'] },
              result: { awardedPoints: 8, maxPoints: 10 },
              question: { items: [{ text: 'amō' }] },
              answerKey: { items: [{ text: 'amō', acceptedAnswers: ['love'] }] },
              itemResults: {
                answers: [{ value: 'love', correct: true, points: { awardedPoints: 8, maxPoints: 10 } }],
              },
            },
          ],
        },
      ],
    },
  },
};

const matchingItem = (): TestResultReviewItem =>
  ({
    id: 'ex-match',
    type: 'matching',
    title: 'Match the verbs',
    maxPoints: 2,
    studentAnswer: { type: 'matching', rounds: [{ 'left-1': 'right-2' }] },
    result: { awardedPoints: 0, maxPoints: 2 },
    question: {
      leftColumn: [{ id: 'left-1', value: 'amo' }],
      rightColumn: [
        { id: 'right-1', value: 'I love' },
        { id: 'right-2', value: 'I walk' },
      ],
      expectedMatchCount: 1,
    },
    answerKey: { pairs: [{ leftId: 'left-1', leftValue: 'amo', rightId: 'right-1', rightValue: 'I love' }] },
    itemResults: { rounds: [] },
  }) as unknown as TestResultReviewItem;

const collectModelText = (model: ReturnType<typeof buildTestResultPdfModel>): string =>
  [
    model.kindLabel,
    model.title,
    model.submittedAtLabel,
    model.studentName,
    model.studentUsername,
    model.studentEmail,
    model.percentageLabel,
    model.scoreLabel,
    model.maxScoreLabel,
    model.outcomeLabel,
    model.passingPercentageLabel,
    model.reviewUnavailableNote,
    ...model.exerciseSummaries.flatMap(exercise => [
      exercise.title,
      exercise.statusLabel,
      exercise.awardedPoints,
      exercise.maxPoints,
    ]),
    ...model.exercises.flatMap(exercise => [
      exercise.title,
      exercise.statusLabel,
      exercise.awardedPoints,
      exercise.maxPoints,
      ...exercise.groups.flatMap(group => [group.heading, ...group.lines]),
    ]),
  ]
    .filter(Boolean)
    .join('\n');

describe('test result PDF renderer', () => {
  it('writes a PDF that starts with the PDF header', async () => {
    const model = buildTestResultPdfModel({
      result,
      identity: { name: 'Jane Doe', username: 'jdoe', email: 'jane@school.edu' },
      source: { kindLabel: 'Test', title: 'Chapter 3 Quiz' },
    });
    const bytes = await renderTestResultPdf(model);
    expect(Buffer.from(bytes.subarray(0, 4)).toString('utf8')).toBe('%PDF');
    expect(bytes.byteLength).toBeGreaterThan(1000);
    const again = await renderTestResultPdf(model);
    expect(Buffer.from(again.subarray(0, 4)).toString('utf8')).toBe('%PDF');
  });

  it('encodes matching pairs with a Noto-safe separator instead of arrows', async () => {
    const matchingResult: StudentTestResult = {
      ...result,
      review: {
        ...result.review!,
        content: { pages: [{ id: 'page-0', title: 'Page 1', items: [matchingItem()] }] },
      },
    };
    const model = buildTestResultPdfModel({
      result: matchingResult,
      identity: { name: 'Jane Doe', username: 'jdoe', email: 'jane@school.edu' },
      source: { kindLabel: 'Test', title: 'Chapter 3 Quiz' },
    });
    const text = collectModelText(model);
    expect(RESULT_PDF_PAIR_SEPARATOR).toBe(' — ');
    expect(text).toContain(`amo${RESULT_PDF_PAIR_SEPARATOR}I love`);
    expect(text).toContain(`amo${RESULT_PDF_PAIR_SEPARATOR}I walk`);
    expect(text).not.toContain('↔');
    expect(text).not.toContain('→');

    const fontBytes = new Uint8Array(
      await readFile(path.join(process.cwd(), 'src/lib/tests/fonts/NotoSans-Regular.ttf'))
    );
    const font = fontkit.create(fontBytes);
    for (const character of text) {
      const codePoint = character.codePointAt(0);
      if (codePoint === undefined || character === '\n') continue;
      expect(font.hasGlyphForCodePoint(codePoint)).toBe(true);
    }

    const bytes = await renderTestResultPdf(model);
    expect(Buffer.from(bytes.subarray(0, 4)).toString('utf8')).toBe('%PDF');
  });
});

const previewModel = (): TestResultPdfModel =>
  buildTestResultPdfModel({
    result,
    identity: { name: 'Jane Doe', username: 'jdoe', email: 'jane@school.edu' },
    source: { kindLabel: 'Test', title: 'Chapter 3 Quiz' },
  });

async function inspectRender(model: TestResultPdfModel) {
  const draw = jest.spyOn(PDFPage.prototype, 'drawText');
  try {
    const bytes = await renderTestResultPdf(model);
    const pages = [...new Set(draw.mock.contexts)];
    const text = draw.mock.calls.map(([value, options], index) => ({
      value,
      page: pages.indexOf(draw.mock.contexts[index]),
      x: options!.x!,
      y: options!.y!,
      size: options!.size!,
      width: options!.font!.widthOfTextAtSize(value, options!.size!),
    }));
    const pdf = await PDFDocument.load(bytes);
    return { text, pageCount: pdf.getPageCount() };
  } finally {
    draw.mockRestore();
  }
}

function expectTextInsidePage(text: Awaited<ReturnType<typeof inspectRender>>['text']) {
  for (const line of text) {
    expect(line.x).toBeGreaterThanOrEqual(48);
    expect(line.x + line.width).toBeLessThanOrEqual(564.01);
    expect(line.y === 20 || line.y >= 48).toBe(true);
    expect(line.y + line.size).toBeLessThanOrEqual(748);
  }
}

describe('test-like PDF layout', () => {
  it('aligns answers in two columns and removes duplicate summary chrome', async () => {
    const { text, pageCount } = await inspectRender(previewModel());
    const values = text.map(line => line.value);
    expect(pageCount).toBe(1);
    expect(values).not.toContain('Exercise scores');
    expect(values).not.toContain('QUESTION');
    expect(values.join(' ')).not.toMatch(/jdoe|jane@school.edu|Passing mark/);
    expect(values.filter(value => value === 'Fill amō')).toHaveLength(1);
    const expected = text.find(line => line.value === 'EXPECTED ANSWER')!;
    const student = text.find(line => line.value === 'STUDENT ANSWER')!;
    expect(student.page).toBe(expected.page);
    expect(student.y).toBe(expected.y);
    expect(student.x).toBeGreaterThan(expected.x);
    expectTextInsidePage(text);
  });

  it.each(['prompt', 'answers', 'translation'] as const)(
    'paginates long %s without clipping or losing the last line',
    async kind => {
      const model = previewModel();
      const longLines = Array.from({ length: 140 }, (_, index) => `Line ${index + 1}: amō, vidēre, nōs ambulāmus.`);
      model.exercises[0].groups =
        kind === 'prompt'
          ? [
              { heading: 'Question', lines: longLines },
              { heading: 'Student answer', tone: 'student', lines: ['Final answer'] },
            ]
          : kind === 'answers'
            ? [
                { heading: 'Expected answer', tone: 'answer', lines: longLines },
                { heading: 'Student answer', tone: 'incorrect', lines: longLines },
              ]
            : [
                { heading: 'Question', lines: ['Translate this passage.'] },
                { heading: 'Student answer', tone: 'partial', lines: longLines },
              ];
      const { text, pageCount } = await inspectRender(model);
      expect(pageCount).toBeGreaterThan(2);
      for (const line of longLines)
        expect(text.filter(entry => entry.value === line)).toHaveLength(kind === 'answers' ? 2 : 1);
      expect(text.some(line => line.value.includes('(continued)'))).toBe(true);
      if (kind === 'answers') {
        for (let page = 0; page < pageCount; page += 1) {
          const labels = text.filter(line => line.page === page && /^(EXPECTED|STUDENT) ANSWER$/.test(line.value));
          expect(labels).toHaveLength(2);
          expect(labels[0].y).toBe(labels[1].y);
        }
      }
      expectTextInsidePage(text);
    }
  );

  it('wraps long titles and identities and bounds the running footer', async () => {
    const model = previewModel();
    model.title = `${'A very long Latin assessment title '.repeat(100)}TITLE-END`;
    model.studentName = `${'Student with a very long name '.repeat(80)}NAME-END`;
    model.exercises[0].title = `${'A long exercise title '.repeat(100)}EXERCISE-END`;
    const { text, pageCount } = await inspectRender(model);
    expect(pageCount).toBeGreaterThan(2);
    for (const ending of ['TITLE-END', 'NAME-END', 'EXERCISE-END']) {
      expect(text.some(line => line.y !== 20 && line.value.includes(ending))).toBe(true);
    }
    expectTextInsidePage(text);
  });

  it('keeps table cells aligned, repeats headings after page breaks, and preserves wide tables', async () => {
    const model = previewModel();
    model.exercises[0].groups = [
      {
        lines: [],
        table: {
          columns: Array.from({ length: 7 }, (_, index) => `Column ${index + 1}`),
          rows: Array.from({ length: 28 }, (_, row) =>
            Array.from({ length: 7 }, (_, col) => ({ lines: [`Cell ${row + 1},${col + 1}`] }))
          ),
        },
      },
    ];
    const { text, pageCount } = await inspectRender(model);
    expect(pageCount).toBeGreaterThan(1);
    for (let row = 1; row <= 28; row += 1) {
      for (let col = 1; col <= 7; col += 1) {
        expect(text.filter(line => line.value === `Cell ${row},${col}`)).toHaveLength(col === 1 ? 2 : 1);
      }
    }
    for (let page = 0; page < pageCount; page += 1) {
      const cells = text.filter(line => line.page === page && line.value.startsWith('Cell '));
      if (!cells.length) continue;
      expect(text.some(line => line.page === page && line.value === 'COLUMN 1' && line.y > cells[0].y)).toBe(true);
    }
    const firstRow = text.filter(line => /^Cell 1,[1-4]$/.test(line.value));
    expect(new Set(firstRow.slice(0, 4).map(line => line.y)).size).toBe(1);
    const yAt = (row: number) => text.find(line => line.value === `Cell ${row},2`)!.y;
    expect(yAt(1) - yAt(2)).toBe(yAt(2) - yAt(3));
    expectTextInsidePage(text);
  });

  it('keeps score summaries when detailed review is unavailable', async () => {
    const model = previewModel();
    model.exercises = [];
    model.reviewUnavailableNote = 'The detailed review could not be loaded.';
    const { text } = await inspectRender(model);
    expect(text.some(line => line.value === model.reviewUnavailableNote)).toBe(true);
    expect(text.some(line => line.value === '1. Fill amō')).toBe(true);
    expectTextInsidePage(text);
  });
});
