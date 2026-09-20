import { LEARNING_UNITS_COLLECTION, MOCK_TESTS_COLLECTION } from '@/shared/constants/firestore';
import { createSubmittedResultPdf } from '@/src/lib/tests/result-pdf.server';
import { renderTestResultPdf } from '@/src/lib/tests/result-pdf-render.server';
import type { StudentTestResult } from '@/src/types/test-results';
import type { Firestore } from 'firebase-admin/firestore';

jest.mock('@/src/services/firebase-admin', () => ({ adminDb: {} }));

jest.mock('@/src/lib/tests/result-pdf-render.server', () => ({
  renderTestResultPdf: jest.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));

const submittedAt = '2026-09-19T15:04:05.000Z';

const result = (origin: StudentTestResult['attempt']['origin']): StudentTestResult => ({
  attempt: {
    id: 'attempt-1',
    versionId: 'version-1',
    passingPercentage: 70,
    origin,
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
  review: null,
});

const createDb = (docs: Record<string, unknown>, options?: { fail?: boolean }): Firestore =>
  ({
    collection(name: string) {
      return {
        doc(id: string) {
          return {
            async get() {
              if (options?.fail) throw new Error('unavailable');
              return { data: () => docs[`${name}/${id}`] };
            },
          };
        },
      };
    },
  }) as Firestore;

describe('createSubmittedResultPdf', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to Test/Student titles when lookups fail', async () => {
    const { filename } = await createSubmittedResultPdf(
      result({ kind: 'normal-test', testId: 'test-1' }),
      { uid: 'student-1', email: null },
      createDb({}, { fail: true })
    );

    expect(filename).toBe('student-test-2026-09-19.pdf');
    expect(renderTestResultPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        kindLabel: 'Test',
        title: 'Test',
        studentName: 'Student',
        studentUsername: null,
        studentEmail: null,
      })
    );
  });

  it('uses the lesson title and student profile when they exist', async () => {
    const { filename } = await createSubmittedResultPdf(
      result({ kind: 'normal-test', testId: 'test-1' }),
      { uid: 'student-1', email: 'ignored@school.edu' },
      createDb({
        [`${LEARNING_UNITS_COLLECTION}/test-1`]: { title: 'Chapter 3 Quiz' },
        'users/student-1': {
          firstName: 'Jane',
          lastName: 'Doe',
          username: 'jdoe',
          email: 'jane@school.edu',
        },
      })
    );

    expect(filename).toBe('jane-doe-chapter-3-quiz-2026-09-19.pdf');
    expect(renderTestResultPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        kindLabel: 'Test',
        title: 'Chapter 3 Quiz',
        studentName: 'Jane Doe',
        studentUsername: 'jdoe',
        studentEmail: 'jane@school.edu',
      })
    );
  });

  it('reads mock titles and falls back to the auth email when the profile is missing', async () => {
    const { filename } = await createSubmittedResultPdf(
      result({ kind: 'mock-test', mockTestId: 'mock-1' }),
      { uid: 'student-1', email: 'jane@school.edu' },
      createDb({
        [`${MOCK_TESTS_COLLECTION}/mock-1`]: { title: 'Practice mock' },
      })
    );

    expect(filename).toBe('jane-practice-mock-2026-09-19.pdf');
    expect(renderTestResultPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        kindLabel: 'Mock test',
        title: 'Practice mock',
        studentName: 'jane',
        studentEmail: 'jane@school.edu',
      })
    );
  });
});
