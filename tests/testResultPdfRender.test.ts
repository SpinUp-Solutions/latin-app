import { renderTestResultPdf } from '@/src/lib/tests/result-pdf-render.server';
import { buildTestResultPdfModel } from '@/src/lib/tests/result-pdf-model';
import type { StudentTestResult } from '@/src/types/test-results';

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
});
