/** @jest-environment node */

import { renderTestResultPdf } from '@/src/lib/tests/result-pdf-render.server';
import { buildTestResultPdfModel, RESULT_PDF_PAIR_SEPARATOR } from '@/src/lib/tests/result-pdf-model';
import type { StudentTestResult, TestResultReviewItem } from '@/src/types/test-results';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';

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
